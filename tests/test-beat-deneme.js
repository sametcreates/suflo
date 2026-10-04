/*
 * Ritim + Pro'yu dene: hak analiz başına BİR kez, o analizin ilk timeline çıktısında düşer.
 *
 * İnceleme bulgusu: marker (apply) ilk çıktıda hakkı düşürüp denemeyi kapatıyordu, ama bölme
 * (bol) yine deneme kapısından geçtiği için aynı analiz için ikinci bir hak ve ikinci bir satış
 * penceresi istiyordu ("marker → böl" 2 hak, "böl → marker" 1 hak). beat.js gerçek kaynağıyla
 * sahte DOM/K/KApp/Pro altında yüklenir; ffmpeg yerine sentetik kick dizisi PCM'i verilir.
 */
var fs = require("fs");
var path = require("path");

var KOK = path.join(__dirname, "..");
var SRC = fs.readFileSync(path.join(KOK, "js", "beat.js"), "utf8");
var SR = 16000;

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 300) + "]"); }
}

// 120 BPM kick dizisi (test-beat.js ile aynı taklit): 4 sn, 16 bit LE mono
function kickPcm() {
  var n = 4 * SR, pcm = new Float32Array(n), atak = Math.round(0.005 * SR);
  for (var t = 0.25; t < 3.8; t += 0.5) {
    var bas = Math.round(t * SR);
    for (var i = 0; i < 0.1 * SR && bas + i < n; i++) {
      var r = i < atak ? 0.5 * (1 - Math.cos(Math.PI * i / atak)) : 1;
      pcm[bas + i] += 0.9 * r * Math.exp(-i / (0.02 * SR)) * Math.sin(2 * Math.PI * 60 * i / SR);
    }
  }
  var buf = Buffer.alloc(n * 2);
  for (var j = 0; j < n; j++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[j] * 32767))), j * 2);
  return buf;
}
var PCM = kickPcm();

// Pro'nun deneme davranışının en küçük taklidi (js/pro.js): kapı kurulu denemeyle geçer,
// harcama kurulumu kaldırır ve kalan hakkı döner; kurulu değilse -1
function sahtePro(kalan) {
  var p = { kalan: kalan, kurulu: false, pencere: 0, harcanan: 0, pro: false };
  p.isPro = function () { return p.pro; };
  p.gate = function (f, o) {
    if (p.pro) return true;
    if (o && o.deneme && p.kurulu && p.kalan > 0) return true;
    p.pencere++;
    return false;
  };
  p.kur = function () { p.kurulu = p.kalan > 0; };
  p.denemeHarca = function () {
    if (p.pro || !p.kurulu) return -1;
    p.kurulu = false; p.kalan--; p.harcanan++;
    return p.kalan;
  };
  return p;
}

// beat.js'i yükle; init'in bağladığı tıklama dinleyicileri (analyze / apply / bol) yakalanır
function yukle(pro, o) {
  o = o || {};
  var tik = {}, els = {}, cagri = [], toastlar = [];
  function elm(id) {
    if (!els[id]) {
      els[id] = {
        id: id, hidden: false, disabled: false, textContent: "", innerHTML: "", className: "", style: {},
        value: id === "beat-bant" ? "bass" : (id === "beat-siklik" ? "1" : ""),
        classList: { add: function () {}, remove: function () {} },
        appendChild: function () {},
        addEventListener: function (tur, fn) { if (tur === "click") tik[id] = fn; }
      };
    }
    return els[id];
  }
  var K = {
    log: function () {},
    findFfmpeg: function () { return Promise.resolve("ffmpeg"); },
    tmpDir: function () { return "/tmp"; },
    path: path,
    run: function () { return Promise.resolve({ code: 0, stderr: "" }); },
    fs: { existsSync: function () { return true; }, readFileSync: function () { return PCM; }, unlinkSync: function () {} },
    call: function (fn, arg) {
      cagri.push(fn);
      if (o.basarisiz && o.basarisiz[fn] > 0) { o.basarisiz[fn]--; return Promise.resolve({ ok: false, error: "Kilitli iz" }); }
      if (fn === "KS_addMarkers") return Promise.resolve({ ok: true, added: arg.times.length });
      if (fn === "KS_splitSelectedAt") return Promise.resolve({ ok: true, cuts: arg.times.length });
      return Promise.resolve({ ok: false, error: "?" });
    },
    hataYardimi: function (e) { return String(e && e.message || e); }
  };
  var KApp = {
    ctx: function () { return { sel: { name: "muzik.wav", inPoint: 0, dur: 4, mediaPath: "muzik.wav", clipStart: 10, clipEnd: 14 } }; },
    toast: function (m) { toastlar.push(m); },
    onContext: function () {}
  };
  var document = { getElementById: elm, createElement: function () { return elm("_tik" + Object.keys(els).length); } };
  var KBeat = new Function("window", "document", "K", "KApp", "Pro", SRC + "\nreturn window.KBeat;")({}, document, K, KApp, pro);
  KBeat.init();
  return { tik: tik, cagri: cagri, toastlar: toastlar, els: els };
}

(async function () {
  /* 1) analiz → marker → böl: tek hak, ikinci pencere yok */
  var pro = sahtePro(3);
  var b = yukle(pro);
  ok("dinleyiciler bağlandı (analiz, marker, böl)", ["beat-analyze", "beat-apply", "beat-split"].every(function (id) { return typeof b.tik[id] === "function"; }), Object.keys(b.tik).join(","));
  await b.tik["beat-analyze"]();
  ok("kurulmadan analiz satış penceresi açar, analiz çalışmaz", pro.pencere === 1 && !b.els["beat-result"], pro.pencere);
  pro.kur();
  await b.tik["beat-analyze"]();
  ok("kurulu denemeyle analiz vuruş bulur, hak düşmez", b.els["beat-result"] && b.els["beat-result"].hidden === false && pro.harcanan === 0 && pro.kurulu,
    b.els["beat-status"] && b.els["beat-status"].textContent);
  await b.tik["beat-apply"]();
  ok("marker (ilk çıktı) 1 hak düşürür", pro.harcanan === 1 && pro.kalan === 2 && b.cagri.indexOf("KS_addMarkers") !== -1, pro.harcanan);
  await b.tik["beat-split"]();
  ok("aynı analizle bölme: yeni pencere ve yeni hak YOK, bölme yapılır", pro.pencere === 1 && pro.harcanan === 1 && b.cagri.indexOf("KS_splitSelectedAt") !== -1,
    "pencere " + pro.pencere + " harcanan " + pro.harcanan + " cagri " + b.cagri.join(","));
  await b.tik["beat-split"]();
  await b.tik["beat-apply"]();
  ok("aynı analizden sonraki çıktılar da hak yemez", pro.harcanan === 1 && pro.pencere === 1, pro.harcanan);
  await b.tik["beat-analyze"]();
  ok("yeni analiz yeniden deneme ister (satış penceresi)", pro.pencere === 2 && pro.harcanan === 1, pro.pencere);
  pro.kur();
  await b.tik["beat-analyze"]();
  await b.tik["beat-split"]();
  ok("yeni analizin ilk çıktısı (bölme) yeni hak düşürür", pro.harcanan === 2 && pro.kalan === 1, pro.harcanan);

  /* 2) analiz → böl → marker: yine tek hak (sıra fark etmez) */
  var pro2 = sahtePro(3);
  var b2 = yukle(pro2);
  pro2.kur();
  await b2.tik["beat-analyze"]();
  await b2.tik["beat-split"]();
  await b2.tik["beat-apply"]();
  ok("böl → marker sırası da tek hak", pro2.harcanan === 1 && pro2.pencere === 0, "harcanan " + pro2.harcanan + " pencere " + pro2.pencere);

  /* 3) başarısız çıktı hak yemez; aynı analizin sonraki başarılı çıktısı yer */
  var pro3 = sahtePro(3);
  var b3 = yukle(pro3, { basarisiz: { KS_addMarkers: 1 } });
  pro3.kur();
  await b3.tik["beat-analyze"]();
  await b3.tik["beat-apply"]();
  ok("başarısız marker hak düşürmez, deneme kurulu kalır", pro3.harcanan === 0 && pro3.kurulu, pro3.harcanan);
  await b3.tik["beat-split"]();
  ok("sonra başarılı bölme hakkı düşürür (pencere yok)", pro3.harcanan === 1 && pro3.pencere === 0, "harcanan " + pro3.harcanan + " pencere " + pro3.pencere);
  await b3.tik["beat-apply"]();
  ok("ardından marker aynı analizle hak yemez", pro3.harcanan === 1, pro3.harcanan);

  /* 4) Pro kullanıcı: pencere ve harcama yok */
  var pro4 = sahtePro(3); pro4.pro = true;
  var b4 = yukle(pro4);
  await b4.tik["beat-analyze"]();
  await b4.tik["beat-apply"]();
  await b4.tik["beat-split"]();
  ok("Pro: pencere ve harcama yok, iki çıktı da yapılır", pro4.pencere === 0 && pro4.harcanan === 0 && b4.cagri.length === 2, b4.cagri.join(","));

  console.log(gecti + "/" + (gecti + kaldi) + " gecti");
  process.exit(kaldi ? 1 : 0);
})().catch(function (e) { console.log("FAIL beklenmeyen hata: " + (e && e.stack || e)); process.exit(1); });
