// Suflo testi: Viral Skor 2.0 panel akışı (js/viral.js) — sahte DOM + sahte K/KCaptions ile:
// ayarların kalıcılığı, istem seçenekleri, kart (halka, alt puan çubukları, kanca seçimi),
// ±1 cümle düğmeleri (yalnız o kart yenilenir, In/Out canlı), filtre/sıralama, marker ve kopyalama
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var H = require(path.join(KOK, "js", "highlights.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : "")); }
function J(x) { return JSON.stringify(x); }

var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");

/* ---------------- sahte DOM ---------------- */
function Oge(tag, id) {
  var o = {
    tagName: String(tag || "div").toUpperCase(), id: id || "", className: "", textContent: "", title: "", value: "",
    checked: false, disabled: false, hidden: false, type: "", name: "", style: {}, _attr: {}, _olay: {}, children: [], parentNode: null,
    setAttribute: function (a, v) { this._attr[a] = String(v); },
    getAttribute: function (a) { return this._attr[a] === undefined ? null : this._attr[a]; },
    appendChild: function (c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    replaceChild: function (yeni, eski) {
      var i = this.children.indexOf(eski);
      if (i < 0) throw new Error("replaceChild: eski cocuk yok");
      if (yeni.parentNode) yeni.parentNode.removeChild(yeni);
      this.children[i] = yeni; yeni.parentNode = this; eski.parentNode = null; return eski;
    },
    addEventListener: function (t, fn) { (this._olay[t] = this._olay[t] || []).push(fn); },
    select: function () {}, focus: function () {}
  };
  Object.defineProperty(o, "innerHTML", {
    get: function () { return ""; },
    set: function () { this.children.forEach(function (c) { c.parentNode = null; }); this.children = []; this.textContent = ""; }
  });
  return o;
}
function tetikle(e, tur, ev) {
  ev = ev || { target: e };
  return Promise.all((e._olay[tur] || []).map(function (fn) { return fn.call(e, ev); }));
}
function hepsi(kok, kosul, out) {
  out = out || [];
  (kok.children || []).forEach(function (c) { if (kosul(c)) out.push(c); hepsi(c, kosul, out); });
  return out;
}
function sinifli(kok, cls) { return hepsi(kok, function (c) { return (" " + c.className + " ").indexOf(" " + cls + " ") !== -1; }); }
function metniTopla(e) { return (e.textContent || "") + (e.children || []).map(metniTopla).join(""); }
function bekle() { return new Promise(function (r) { setTimeout(r, 0); }); }

/* ---------------- sahte ortam ---------------- */
// 300 sn konusma: 60 satir x 5 sn, her 3 satirda bir cumle sonu (2, 5, 8, ...)
function cumleli(n) {
  var out = [];
  for (var k = 0; k < n; k++) out.push({ start: k * 5, end: k * 5 + 4.6, text: "kelime " + k + ((k + 1) % 3 === 0 ? "." : "") });
  return out;
}

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
    if (/\schecked(\s|>)/.test(etiket)) o.checked = true;
    if (tag === "select") {
      var govde = html.slice(html.indexOf(x), html.indexOf("</select>", html.indexOf(x)));
      var sec = govde.match(/<option value="([^"]*)" selected/) || govde.match(/<option value="([^"]*)"/);
      o.value = sec ? sec[1] : "";
    }
    ogeler[id] = o;
  });
  var govdeEl = Oge("body");
  var say = { call: [], toast: [], kaydet: 0, kanca: [], pano: [], chat: [] };
  var durum = { seq: "seq1", segs: cumleli(60), yanit: opts.yanit, hata: null };
  var ayarlar = opts.ayarlar || {};
  var win = {
    document: {
      getElementById: function (id) { return ogeler[id] || null; },
      createElement: function (t) { return Oge(t); },
      body: govdeEl, execCommand: function () { return true; }
    },
    navigator: { clipboard: { writeText: function (t) { say.pano.push(t); return Promise.resolve(); } } },
    // yerlesik nesneler (JSON, Array...) baglamin kendi alemi: disaridan verilirse "instanceof Array" bozulur
    setTimeout: setTimeout,
    K: {
      settings: function () { return ayarlar; }, saveSettings: function () { say.kaydet++; return true; },
      call: function (fn, arg) {
        say.call.push({ fn: fn, arg: JSON.parse(JSON.stringify(arg)) });
        if (fn === "KS_addRangeMarkers") return Promise.resolve({ ok: true, added: arg.ranges.length });
        return Promise.resolve({ ok: true });
      },
      hataYardimi: function (e) { return String(e && e.message || e); }
    },
    KCaptions: {
      getSegments: function () { return durum.segs.map(function (s) { return { start: s.start, end: s.end, text: s.text }; }); },
      rawSegments: function () { return JSON.parse(JSON.stringify(durum.segs)); },
      chatConfig: function () { return { model: "m", key: "k" }; },
      chatCall: function (cfg, body) {
        say.chat.push(body);
        if (durum.hata) return Promise.reject(new Error(durum.hata));
        return Promise.resolve({ choices: [{ message: { content: JSON.stringify(durum.yanit) } }] });
      },
      language: function () { return "tr"; }
    },
    KApp: {
      ctx: function () { return { sequenceId: durum.seq }; },
      toast: function (m) { say.toast.push(m); }
    },
    KKanca: { ekle: function (o) { say.kanca.push(o); return Promise.resolve(true); } },
    Pro: { gate: function () { return true; } }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "highlights.js"), "utf8"), win);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "viral.js"), "utf8"), win);
  return { win: win, el: ogeler, say: say, durum: durum, ayarlar: ayarlar };
}

function kartlar(t) { return t.el["cap-vr-liste"].children; }
function kartBul(t, baslik) {
  return kartlar(t).filter(function (k) { return sinifli(k, "vr-baslik")[0].textContent === baslik; })[0];
}
function dugme(k, metin) { return hepsi(k, function (c) { return c.tagName === "BUTTON" && c.textContent === metin; }); }

// Yanit: A (alt puanli, 85), B (eski puan 7 -> 70), C (dusuk alt puanlar -> 40); B ve C komsu
var YANIT = { clips: [
  { from: 3, to: 8, title: "Büyük itiraf", reason: "Kimsenin beklemediği bir itiraf",
    hooks: ["Bunu *kimse* bilmiyor", "İtiraf zamanı", "Gerçek *şok*"], sub: { hook: 90, standalone: 85, emotion: 80, value: 85, payoff: 80 } },
  { from: 30, to: 35, title: "Eski biçim", score: 7, hook: "Eski gerekçe" },
  { from: 36, to: 41, title: "Zayıf an", reason: "Bilgi var ama yavaş", hooks: ["Yavaş başlık"], sub: { hook: 30, standalone: 40, emotion: 40, value: 60, payoff: 40 } }
] };

async function calistir() {
  /* ---------- 1) ayarlar geri yüklenir ---------- */
  var t = ortam({ yanit: YANIT, ayarlar: { viralTur: "komedi", viralAdet: 8, viralOdak: "fiyat\nkonusu", viralMinPuan: 60, viralSira: "zaman" } });
  t.win.KViral.init();
  ok("init: tür, adet, odak, ≥60 ve sıralama K.settings'ten geri gelir",
    t.el["cap-vr-tur"].value === "komedi" && t.el["cap-vr-adet"].value === "8" && t.el["cap-vr-odak"].value === "fiyat konusu" &&
    t.el["cap-vr-min"].checked === true && t.el["cap-vr-sira"].value === "zaman",
    J([t.el["cap-vr-tur"].value, t.el["cap-vr-adet"].value, t.el["cap-vr-odak"].value, t.el["cap-vr-min"].checked, t.el["cap-vr-sira"].value]));
  ok("init: sonuç yokken liste üstü ve not gizli", t.el["cap-vr-liste-ust"].hidden === true && t.el["cap-vr-not"].hidden === true && t.el["cap-vr-aksiyon"].hidden === true);
  var bozuk = ortam({ ayarlar: { viralTur: "constructor", viralAdet: 99, viralSira: "x" } });
  bozuk.win.KViral.init();
  ok("init: bozuk ayar yok sayılır / sıkıştırılır", bozuk.el["cap-vr-tur"].value === "genel" && bozuk.el["cap-vr-adet"].value === "10" && bozuk.el["cap-vr-sira"].value === "puan");
  bozuk.el["cap-vr-tur"].value = "constructor";
  await tetikle(bozuk.el["cap-vr-tur"], "change");
  ok("seçenekler: listede olmayan tür 'genel' kaydedilir", bozuk.ayarlar.viralTur === "genel", bozuk.ayarlar.viralTur);

  /* ---------- 2) arama: istem seçenekleri ve kalıcılık ---------- */
  await tetikle(t.el["cap-vr-bul"], "click");
  var istem = t.say.chat[0] && t.say.chat[0].messages[0].content;
  ok("arama: istem adet/tür/odak taşır, JSON yanıt ister", /pick the 8 best/.test(istem) && /Genre: comedy/.test(istem) && /"fiyat konusu"/.test(istem) &&
    t.say.chat[0].response_format.type === "json_object", istem && istem.slice(0, 120));
  ok("arama: seçenekler kaydedilir (viralTur/Adet/Odak/MinPuan/Sira)", t.say.kaydet > 0 && t.ayarlar.viralTur === "komedi" && t.ayarlar.viralAdet === 8 &&
    t.ayarlar.viralOdak === "fiyat konusu" && t.ayarlar.viralMinPuan === 60 && t.ayarlar.viralSira === "zaman", J(t.ayarlar));
  ok("arama: ≥60 filtresi + zamana göre → 2 kart (A, B), 1 gizli", kartlar(t).length === 2 && sinifli(kartlar(t)[0], "vr-baslik")[0].textContent === "Büyük itiraf" &&
    sinifli(kartlar(t)[1], "vr-baslik")[0].textContent === "Eski biçim" && t.el["cap-vr-bilgi"].textContent === "1 an gizli (60 altı)",
    kartlar(t).map(function (k) { return sinifli(k, "vr-baslik")[0].textContent; }).join(",") + " / " + t.el["cap-vr-bilgi"].textContent);
  ok("arama: liste üstü, tahmin notu ve eylemler görünür", t.el["cap-vr-liste-ust"].hidden === false && t.el["cap-vr-not"].hidden === false && t.el["cap-vr-aksiyon"].hidden === false);

  /* ---------- 3) kart: halka, alt puanlar, gerekçe, kancalar ---------- */
  var A = kartBul(t, "Büyük itiraf"), B = kartBul(t, "Eski biçim");
  var ring = sinifli(A, "vr-ring")[0];
  ok("kart: halka conic-gradient ile puan kadar dolu, bant rengi sınıfta", ring && /\biyi\b/.test(ring.className) && ring.style.background === "conic-gradient(currentColor 85%, rgba(255,255,255,.08) 0)" &&
    sinifli(A, "vr-ring-ic")[0].textContent === "85" && hepsi(A, function (c) { return c.tagName === "SMALL" && c.textContent === "/100 tahmini"; }).length === 1,
    ring && ring.className + " " + ring.style.background);
  var bar = sinifli(A, "vr-barlar")[0];
  ok("kart: 5 alt puan çubuğu (Kanca, Bağımsızlık, Duygu, Değer, Kapanış), Bağımsızlık ipucu",
    bar && sinifli(bar, "vr-bar-ad").map(function (x) { return x.textContent; }).join(",") === "Kanca,Bağımsızlık,Duygu,Değer,Kapanış" &&
    sinifli(bar, "vr-bar-ad")[1].title === "Tek başına anlaşılıyor mu" && sinifli(bar, "vr-bar")[0].children[0].style.width === "90%" &&
    sinifli(bar, "vr-bar-deger").map(function (x) { return x.textContent; }).join(",") === "90,85,80,85,80");
  ok("kart: gerekçe italik satırda", sinifli(A, "vr-neden")[0].textContent === "Kimsenin beklemediği bir itiraf");
  ok("kart: eski biçimde alt puan çubukları gizli, halka 70 (orta)", sinifli(B, "vr-barlar").length === 0 && /\borta\b/.test(sinifli(B, "vr-ring")[0].className) &&
    sinifli(B, "vr-ring-ic")[0].textContent === "70" && sinifli(B, "vr-kancalar").length === 0);
  var radyolar = hepsi(A, function (c) { return c.tagName === "INPUT" && c.type === "radio"; });
  ok("kart: 3 kanca seçeneği radyo, ilki seçili, *vurgu* kalın", radyolar.length === 3 && radyolar[0].checked && !radyolar[1].checked &&
    radyolar.every(function (r) { return r.name === radyolar[0].name; }) &&
    hepsi(sinifli(A, "vr-kanca")[0], function (c) { return c.tagName === "B" && c.textContent === "kimse"; }).length === 1);
  ok("kart: kanca metni label değil (AI metni arayüz çevirisine girmez)", hepsi(sinifli(A, "vr-kancalar")[0], function (c) { return c.tagName === "LABEL"; }).length === 0);
  // ucuncu kancayi sec, Baslik ekle
  radyolar[2].checked = true;
  await tetikle(radyolar[2], "change");
  await tetikle(dugme(A, "Başlık ekle")[0], "click");
  ok("Başlık ekle seçili kanca başlığını anın başına koyar", t.say.kanca.length === 1 && t.say.kanca[0].text === "Gerçek *şok*" && t.say.kanca[0].at === 15, J(t.say.kanca));
  await tetikle(dugme(B, "Başlık ekle")[0], "click");
  ok("kancasız (eski) anda Başlık ekle başlığı kullanır", t.say.kanca[1] && t.say.kanca[1].text === "Eski biçim");

  /* ---------- 4) ±1 cümle ---------- */
  var kenarlar = ["◀ +1 cümle", "−1", "+1 cümle ▶"];
  ok("kart: kenar satırı ◀ +1 cümle, −1 | −1, +1 cümle ▶", kenarlar.every(function (m) { return dugme(A, m).length; }) && dugme(A, "−1").length === 2 &&
    sinifli(A, "vr-sinir")[0].children.map(function (c) { return c.textContent; }).join(" ") === "◀ +1 cümle −1 | −1 +1 cümle ▶");
  var bSon = dugme(B, "+1 cümle ▶")[0];
  ok("komşu ana (C) çakışacak büyüme düğmesi kapalı", bSon.disabled === true && dugme(B, "−1")[1].disabled === false, J([bSon.disabled]));
  var bOnce = B;
  var sureA = sinifli(A, "vr-sure")[0].textContent;
  await tetikle(dugme(A, "+1 cümle ▶")[0], "click");
  var A2 = kartBul(t, "Büyük itiraf");
  ok("+1 cümle ▶: yalnız o kart yeniden çizilir, süre etiketi güncellenir", A2 !== A && kartBul(t, "Eski biçim") === bOnce && sinifli(A2, "vr-sure")[0].textContent !== sureA &&
    /^0:15–0:59 · 45 sn$/.test(sinifli(A2, "vr-sure")[0].textContent), sinifli(A2, "vr-sure")[0].textContent);
  ok("kart yenilenince kanca seçimi korunur", hepsi(A2, function (c) { return c.tagName === "INPUT" && c.type === "radio"; })[2].checked === true);
  ok("In/Out bu karttan ayarlanmadıysa kenar kaydırmak Premiere'e dokunmaz", t.say.call.filter(function (c) { return c.fn === "KS_setInOut"; }).length === 0);
  await tetikle(dugme(A2, "Önizle")[0], "click");
  var io = t.say.call.filter(function (c) { return c.fn === "KS_setInOut"; });
  ok("Önizle: KS_setInOut anın sekans zamanlarıyla", io.length === 1 && io[0].arg.start === 15 && io[0].arg.end === 59.6, J(io));
  // caption duzenlemesi: aramadan sonra transkript degisir (basa satir eklenir); kenarlar arama anindaki kopyaya gore
  t.durum.segs.unshift({ start: 0, end: 1, text: "yeni satır." });
  await tetikle(dugme(A2, "−1")[1], "click");
  io = t.say.call.filter(function (c) { return c.fn === "KS_setInOut"; });
  ok("In/Out bu karttansa ve sekans aynıysa kenar kayınca In/Out canlı güncellenir (arama anındaki satırlarla)", io.length === 2 && io[1].arg.start === 15 && io[1].arg.end === 44.6, J(io));
  var A3 = kartBul(t, "Büyük itiraf");
  ok("−1: süre 30 sn, ayar aralığında (uyarı yok)", /^0:15–0:44 · 30 sn$/.test(sinifli(A3, "vr-sure")[0].textContent) && !/uyari/.test(sinifli(A3, "vr-sure")[0].className));
  await tetikle(dugme(A3, "−1")[1], "click");
  var A4 = kartBul(t, "Büyük itiraf");
  ok("hazır ayarın dışına çıkmak serbest, süre etiketi sarı (uyari)", /uyari/.test(sinifli(A4, "vr-sure")[0].className) && /15 sn/.test(sinifli(A4, "vr-sure")[0].textContent) &&
    /dışında/.test(sinifli(A4, "vr-sure")[0].title), sinifli(A4, "vr-sure")[0].textContent + " " + sinifli(A4, "vr-sure")[0].className);
  t.durum.seq = "baska";
  var once = t.say.call.length;
  await tetikle(dugme(A4, "+1 cümle ▶")[0], "click");
  ok("başka sekans aktifse In/Out güncellenmez", t.say.call.length === once);
  await tetikle(dugme(kartBul(t, "Büyük itiraf"), "Önizle")[0], "click");
  ok("başka sekansta Önizle uyarır, Premiere'e dokunmaz", t.say.call.length === once && /başka bir sekansta/.test(t.el["cap-vr-durum"].textContent));
  t.durum.seq = "seq1";

  /* ---------- 5) filtre / sıralama ---------- */
  t.el["cap-vr-min"].checked = false;
  await tetikle(t.el["cap-vr-min"], "change");
  ok("≥60 kapatılınca 3 kart, bilgi boş, ayar kaydedilir", kartlar(t).length === 3 && t.el["cap-vr-bilgi"].textContent === "" && t.ayarlar.viralMinPuan === 0);
  t.el["cap-vr-sira"].value = "puan";
  await tetikle(t.el["cap-vr-sira"], "change");
  ok("puana göre sıralama: 85, 70, 40", kartlar(t).map(function (k) { return sinifli(k, "vr-ring-ic")[0].textContent; }).join(",") === "85,70,40" && t.ayarlar.viralSira === "puan");
  // komsu kart (C) bastan kisalinca B'nin sona buyume dugmesi yeniden cizilmeden acilir
  var Bk = kartBul(t, "Eski biçim"), Ck = kartBul(t, "Zayıf an");
  ok("komşu kart: B'nin sona büyüme düğmesi başta kapalı", dugme(Bk, "+1 cümle ▶")[0].disabled === true);
  await tetikle(dugme(Ck, "−1")[0], "click");
  ok("C baştan kısalınca B yeniden çizilmez ama sona büyüme düğmesi açılır", kartBul(t, "Eski biçim") === Bk && dugme(Bk, "+1 cümle ▶")[0].disabled === false &&
    kartBul(t, "Zayıf an") !== Ck);

  /* ---------- 6) marker ve kopyalama ---------- */
  await tetikle(t.el["cap-vr-marker"], "click");
  var mk = t.say.call.filter(function (c) { return c.fn === "KS_addRangeMarkers"; })[0];
  ok("marker yorumu: puan/100 · gerekçe; eski biçimde gerekçe eski hook", mk && mk.arg.ranges.length === 3 && mk.arg.ranges[0].comment === "85/100 · Kimsenin beklemediği bir itiraf" &&
    mk.arg.ranges[1].comment === "70/100 · Eski gerekçe" && mk.arg.ranges[0].name === "🔥 Büyük itiraf", mk && J(mk.arg.ranges.map(function (r) { return r.comment; })));
  await tetikle(t.el["cap-vr-kopyala"], "click");
  await bekle();
  var pano = t.say.pano[0] || "";
  ok("Listeyi kopyala ayrıntılı biçimi kullanır (puan + alt puanlar + seçili kanca)", /^1\. Büyük itiraf \(0:15–[^)]+\) · 85\/100 tahmini \(kanca 90 · bağımsızlık 85/.test(pano) &&
    /\n   Kanca: Gerçek şok/.test(pano) && /2\. Eski biçim \([^)]+\) · 70\/100 tahmini — Eski gerekçe/.test(pano), pano);
  await tetikle(t.el["cap-vr-shorts"], "click");
  var sh = t.say.call.filter(function (c) { return c.fn === "KS_makeShorts"; });
  ok("Shorts: KS_makeShorts çağrısı değişmedi (aralık + ad + dikey)", sh.length === 3 && J(Object.keys(sh[0].arg).sort()) === J(["dikey", "ranges"]) &&
    J(Object.keys(sh[0].arg.ranges[0]).sort()) === J(["end", "name", "start"]) && /^Shorts 1 · Büyük itiraf$/.test(sh[0].arg.ranges[0].name));

  /* ---------- 7) başarısız arama önceki sonucu bozmaz; hepsi 60 altı ---------- */
  t.durum.hata = "ağ yok";
  await tetikle(t.el["cap-vr-bul"], "click");
  ok("başarısız arama: önceki kartlar ve durum korunur", kartlar(t).length === 3 && /ağ yok/.test(t.el["cap-vr-durum"].textContent));
  t.durum.hata = null;
  t.durum.yanit = { clips: [{ from: 3, to: 8, title: "a", score: 4 }, { from: 20, to: 26, title: "b", score: 5 }, { from: 40, to: 46, title: "c", score: 3 }] };
  t.el["cap-vr-min"].checked = true;
  await tetikle(t.el["cap-vr-bul"], "click");
  ok("hepsi 60 altı + ≥60: en iyi 2 an, kesik çerçeve ve bilgi satırı", kartlar(t).length === 2 && kartlar(t).every(function (k) { return /dusuk/.test(k.className); }) &&
    t.el["cap-vr-bilgi"].textContent === "60 ve üstü an yok — en iyi 2 an gösteriliyor", t.el["cap-vr-bilgi"].textContent);
  var n = t.say.call.length, ilkKart = kartlar(t)[0], ileri = dugme(ilkKart, "+1 cümle ▶")[0];
  var sureOnce = sinifli(ilkKart, "vr-sure")[0].textContent;
  await tetikle(ileri, "click");
  ok("yeni arama In/Out bağını sıfırlar: kenar kayar ama Premiere'e dokunulmaz", !ileri.disabled && t.say.call.length === n &&
    sinifli(kartlar(t)[0], "vr-sure")[0].textContent !== sureOnce, sureOnce + " → " + sinifli(kartlar(t)[0], "vr-sure")[0].textContent);
  var dis = t.win.KViral.liste();
  ok("KViral.liste(): ekrandaki anlar (Shorts paketi için), kopya", dis.length === 2 && dis[0].low === true && typeof dis[0].score === "number" && dis[0] !== dis[1]);
}

calistir().then(function () {
  // viral.js statik kurallar: kartlar textContent ile (AI metni HTML olarak yorumlanmaz), host degisikligi yok
  var src = fs.readFileSync(path.join(KOK, "js", "viral.js"), "utf8");
  ok("viral.js: innerHTML yalnız listeyi boşaltmak için", (src.match(/innerHTML\s*=/g) || []).length === (src.match(/innerHTML = "";/g) || []).length);
  ok("viral.js: KDinle kullanılmaz (viral zamanları sekans zamanı)", !/KDinle/.test(src));
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}).catch(function (e) {
  console.log("FAIL beklenmeyen hata: " + (e && e.stack || e));
  process.exit(1);
});
