// Suflo testi: yerel motor seçenekleri panel bağlantısı (3.2 adım 5) — captions.js'in GERÇEK kaynağı
// kesilip sahte K / KEngine / DOM ile çalıştırılır.
//  - transcribeLocal: çözme modu Ayarlar'dan, DTW (-dtw <ön ayar> -nfa) yalnız istenince, -tr yalnız
//    Small / Large, çeviride İngilizce ipucu; tüm t_dtw -1 -> model@derleme için otomatik kapatma ve
//    günlük; tanınmayan bayrak -> DTW'siz yeniden çözme; kapatılmış anahtarda DTW istenmez;
//    'yerel motor: cozme=…' ve süre / gerçek zaman günlüğü
//  - yerelCalistir: -dtw varken canlı satır yok, ilerleme sürer; tanınmayan bayrak hatası stderr taşır
//  - motorSecenekDurumu: DTW anahtarı yalnız yerel motor + kelime tabanlı mod / Suflo Stili, çeviri
//    satırı yalnız yerel motor ve dil İngilizce değilken; Turbo + işaretli -> ipucu ve 'Large'a geç'
//  - go(): engel kapıdan önce, kapı 'offlineTranslate' + deneme, hak başarıdan sonra; önbellek atlanır,
//    satırlar cikisDili "en" işareti alır; transcribeSuflo çeviride bulut yedeğine geçmez
//  - dosya adı eki (.en.srt), Ayarlar › Çözme, panel açılışında Premiere çağrısı yok
var fs = require("fs"), path = require("path"), os = require("os");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
function govde(imza) {
  var i = cap.indexOf(imza);
  if (i < 0) throw new Error("yok: " + imza);
  return cap.slice(i, cap.indexOf("\n  }\n", i) + 4);
}
function sabit(ad) {
  var m = new RegExp("\\n  var " + ad + " = [^\\n]*\\n").exec(cap);
  if (!m) throw new Error("sabit yok: " + ad);
  return m[0];
}
var WAR = require(path.join(KOK, "js", "whisper-args.js"));
var WW = require(path.join(KOK, "js", "whisper-words.js"));
var WA = require(path.join(KOK, "js", "whisper-akis.js"));
var CT = require(path.join(KOK, "js", "caption-text.js"));
var FIX = path.join(__dirname, "fixtures");
var DTW_JSON = fs.readFileSync(path.join(FIX, "whisper-ojf-dtw.json"), "utf8");
var TR_JSON = fs.readFileSync(path.join(FIX, "whisper-ojf-tr.json"), "utf8");
var DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-motor-"));

function dugum(ek) {
  var d = { hidden: false, checked: false, disabled: false, value: "", textContent: "", attrs: {}, childNodes: [], className: "", scrollTop: 0, scrollHeight: 0 };
  d.setAttribute = function (k, v) { d.attrs[k] = String(v); };
  d.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(d.attrs, k) ? d.attrs[k] : null; };
  d.appendChild = function (c) { d.childNodes.push(c); return c; };
  Object.defineProperty(d, "innerHTML", { set: function () { d.childNodes = []; }, get: function () { return ""; } });
  for (var k in ek || {}) d[k] = ek[k];
  return d;
}

/*
 * Ortam: model ("turbo" | "large" | "small" | "tiny"), kurulu modeller, yerel motor var mı, ayarlar ve
 * K.run senaryosu (args -> { kod, stderr, json }).
 */
function ortam(o) {
  o = o || {};
  var ayar = o.ayar || {};
  var gunluk = [], durumlar = [], kosular = [], toastlar = [], kayit = 0;
  var MODEL_DOSYA = { tiny: "ggml-tiny-q5_1.bin", base: "ggml-base-q5_1.bin", small: "ggml-small-q5_1.bin", turbo: "ggml-large-v3-turbo-q5_0.bin", large: "ggml-large-v3-q5_0.bin" };
  var model = o.model || "turbo";
  var kurulu = o.kurulu || [model];
  var yerel = o.yerel !== false;
  var dom = {
    "cap-lang": dugum({ value: o.dil === undefined ? "tr" : o.dil }), "cap-maxlen": dugum({ value: o.maxlen || "k1" }),
    "cap-dtw-sar": dugum({ hidden: true }), "cap-dtw": dugum({ checked: !!o.dtwKutu }), "cap-dtw-not": dugum({ hidden: true }),
    "cap-cevir-en-sar": dugum({ hidden: true }), "cap-cevir-en": dugum({ checked: !!o.cevirKutu }), "cap-cevir-en-not": dugum({ hidden: true }),
    "cap-cevir-en-not-metin": dugum(), "cap-cevir-en-gec": dugum(), "cap-canli": dugum(), "cap-canli-liste": dugum(),
    "cap-export-fmt": dugum({ value: "srt" }), "cap-cift-dil": dugum({ checked: false })
  };
  var K = {
    nodeOK: true, MAC: false, fs: fs, path: path, os: { cpus: function () { return [1, 2, 3, 4, 5, 6]; } },
    settings: function () { return ayar; }, saveSettings: function () { kayit++; },
    log: function (m) { gunluk.push(String(m)); },
    tmpDir: function () { return DIZIN; },
    whisperLocal: function () { return yerel ? { exe: "whisper-cli", model: path.join("/w/models", MODEL_DOSYA[model]) } : null; },
    findFfmpeg: function () { return Promise.resolve("ffmpeg"); },
    iptalHatasi: function (m) { var e = new Error(m || "İptal edildi"); e.iptal = true; return e; },
    call: function () { throw new Error("Premiere çağrısı yapılmamalı"); },
    run: function (exe, args, op) {
      kosular.push(args.slice());
      var sonuc = (o.senaryo || function () { return { json: TR_JSON }; })(args, kosular.length);
      var ob = args[args.indexOf("-of") + 1];
      if (sonuc.json) fs.writeFileSync(ob + ".json", sonuc.json);
      if (sonuc.stdout && op && op.onStdout) op.onStdout(sonuc.stdout);
      if (op && op.onStderr) op.onStderr("whisper_print_progress_callback: progress = 50%\n");
      return Promise.resolve({ code: sonuc.kod || 0, stdout: "", stderr: sonuc.stderr || "" });
    }
  };
  var KEngine = {
    activeModel: function () { return yerel ? { id: model } : null; },
    activeModelPath: function () { return yerel ? path.join("/w/models", MODEL_DOSYA[model]) : null; },
    installedModels: function () { return kurulu.map(function (id) { return { id: id }; }); },
    modelById: function (id) { return { id: id }; },
    installedBuild: function () { return o.derleme || "cuda"; },
    buildArgs: function (x) {
      var g = {}; for (var k in x) g[k] = x[k];
      g.vad = null;
      var s = WAR.secenekler(g);
      return { args: WAR.olustur(g), vad: false, cozme: s.cozme, dtw: s.dtw, cevir: s.cevir, modelId: s.modelId, gunluk: WAR.gunlukMetni(g) };
    }
  };
  var kod = [
    sabit("CEVIRI_YEREL_UYARISI"), sabit("CEVIRI_TURBO_UYARISI"), sabit("CEVIRI_MODEL_UYARISI"),
    govde("function iptalHatasiYap("), govde("function iptalDenetle("), govde("function canliZaman("), govde("function canliBaslat("),
    govde("function canliSatirDom("), govde("function canliEkle("), govde("function canliKirp("), govde("function canliBitir("),
    govde("function glossaryPrompt("), govde("function yerelDerleme("), govde("function dtwOtomatikKapali("),
    govde("function dtwOtomatikKapat("), govde("function dtwSonucunuIsle("), govde("function cevrimdisiEn("),
    govde("function cevrimdisiCeviriSecili("), govde("function cevrimdisiCeviriEngeli("), govde("function kuruluCeviriModeli("),
    govde("function dtwUygun("), govde("function dtwSecili("), govde("function aktifDtwAnahtari("), govde("function motorSecenekDurumu("),
    govde("function ceviriModelineGec("), govde("function ceviriVar("), govde("function ciftDilAcik("), govde("function dosyaDilEki("),
    govde("async function transcribeLocal("), govde("async function yerelCalistir(")
  ].join("\n");
  var api = new Function("K", "KEngine", "WAR", "WW", "WA", "CT", "el", "document", "window", "KApp", "status", "tc", "AYAR",
    "var aktifIptal = null, canliIs = null, CANLI_GOSTER = 200, algilananDil = '', ekIpucu = '', ceviriDili = '';\n" +
    "var segments = AYAR.segments || [], secilenMogrt = AYAR.mogrt || null, secilenMotorStili = AYAR.stil || '';\n" +
    "function localEngineReady() { return !!KEngine.activeModel() && !!K.whisperLocal(); }\n" +
    "function dilKodu(x) { return String(x || '').slice(0, 2); }\n" +
    "function wavDuration() { return 10; }\n" +
    "function geciciSil() {}\n" +
    "var refreshSetupSayisi = 0; function refreshSetup() { refreshSetupSayisi++; motorSecenekDurumu(); }\n" +
    "var ayarOlay = []; function ayarDegisti(n) { ayarOlay.push(n); }\n" + kod +
    "\nreturn { transcribeLocal: transcribeLocal, yerelCalistir: yerelCalistir, motorSecenekDurumu: motorSecenekDurumu, dosyaDilEki: dosyaDilEki," +
    " dtwSecili: dtwSecili, cevrimdisiCeviriSecili: cevrimdisiCeviriSecili, cevrimdisiCeviriEngeli: cevrimdisiCeviriEngeli, ceviriModelineGec: ceviriModelineGec," +
    " canliBaslat: canliBaslat, canli: function () { return canliIs; }, dil: function () { return algilananDil; }, ayarOlay: ayarOlay," +
    " setSegments: function (s) { segments = s; }, setCeviri: function (d) { ceviriDili = d; }, refreshSetupSayisi: function () { return refreshSetupSayisi; } };")(
    K, KEngine, WAR, WW, WA, CT, function (id) { return dom[id] || null; }, { createElement: function () { return dugum(); } },
    { SufloStyleEngine: { wordBased: function (id) { return id === "karaoke"; } } },
    { toast: function (m) { toastlar.push(m); }, goster: function (ad) { toastlar.push("goster:" + ad); } },
    function (m) { durumlar.push(m); },
    function (sn) { return String(sn); }, o);
  return { api: api, dom: dom, ayar: ayar, gunluk: gunluk, durumlar: durumlar, kosular: kosular, toastlar: toastlar, kayit: function () { return kayit; } };
}
function arg(a, b) { var i = a.indexOf(b); return i < 0 ? undefined : a[i + 1]; }
function gunlukte(e, re) { return e.gunluk.some(function (s) { return re.test(s); }); }

var isler = [];

/* ---------------- 1) transcribeLocal: çözme, DTW, -tr ---------------- */
isler.push(function () {
  var e = ortam({ ayar: { cozme: "hizli", glossary: [{ from: "suflo", to: "Suflo" }] }, senaryo: function () { return { json: DTW_JSON }; } });
  var motor = { dtw: true };
  return e.api.transcribeLocal(path.join(DIZIN, "a.wav"), true, undefined, motor).then(function (segs) {
    var a = e.kosular[0];
    ok("çözme modu Ayarlar'dan: Hızlı = -bs 1 -bo 1", arg(a, "-bs") === "1" && arg(a, "-bo") === "1", a.join(" "));
    ok("DTW: Turbo -> -dtw large.v3.turbo -nfa", arg(a, "-dtw") === "large.v3.turbo" && a.indexOf("-nfa") !== -1);
    ok("çeviri istenmedi: -tr yok, Türkçe ipucu", a.indexOf("-tr") === -1 && /Doğru yazılması gereken/.test(arg(a, "--prompt")));
    ok("DTW kelime zamanı kullanıldı (ışık 0.26)", segs[0].words[1].start === 0.26, js(segs[0].words[1]));
    ok("günlük: 'yerel motor: cozme=hizli …, dtw=large.v3.turbo'", gunlukte(e, /^yerel motor: cozme=hizli \(greedy, -bs 1 -bo 1\), dtw=large\.v3\.turbo/), e.gunluk.join(" | "));
    ok("günlük: DTW ölçülen belirteç sayısı ve süre / gerçek zaman çarpanı", gunlukte(e, /DTW kelime zamanı 25\/37 belirteçte ölçüldü \(turbo@cuda\)/) &&
      gunlukte(e, /^yerel motor bitti: 10\.0s audio \/ [\d.]+s.*cozme=hizli, dtw=large\.v3\.turbo/), e.gunluk.join(" | "));
    ok("DTW çalıştı: otomatik kapatma kaydı yok", !e.ayar.dtwKapali && motor.cevrildi === false);
  });
});
isler.push(function () {
  // motor DTW'yi kapattı (tüm t_dtw -1): turbo@cuda kaydı, sonraki koşu DTW istemez
  var e = ortam({ ayar: {}, senaryo: function () { return { json: TR_JSON }; } });
  return e.api.transcribeLocal(path.join(DIZIN, "b.wav"), true, undefined, { dtw: true }).then(function () {
    ok("tüm t_dtw -1: model@derleme için otomatik kapatıldı ve günlüğe yazıldı", e.ayar.dtwKapali && e.ayar.dtwKapali["turbo@cuda"] &&
      e.ayar.dtwKapali["turbo@cuda"].neden === "t_dtw" && e.kayit() > 0 && gunlukte(e, /DTW istendi ama tüm t_dtw -1/), js(e.ayar.dtwKapali));
    ok("varsayılan çözme En doğru (-bs 5, -bo yok)", arg(e.kosular[0], "-bs") === "5" && e.kosular[0].indexOf("-bo") === -1);
    return e.api.transcribeLocal(path.join(DIZIN, "b.wav"), true, undefined, { dtw: true });
  }).then(function () {
    ok("kapatılmış anahtarda DTW istenmez, nedeni günlükte", e.kosular[1].indexOf("-dtw") === -1 && gunlukte(e, /daha önce otomatik kapatıldı \(turbo@cuda\)/));
  });
});
isler.push(function () {
  // eski derleme -nfa tanımıyor: kod 0, JSON yok, stderr'de 'unknown argument' -> DTW'siz yeniden
  var e = ortam({ ayar: {}, senaryo: function (a, n) {
    return n === 1 ? { stderr: "error: unknown argument: -nfa\n\nusage: whisper-cli [options] file0 file1 ...\n  -h, --help" } : { json: TR_JSON };
  } });
  return e.api.transcribeLocal(path.join(DIZIN, "c.wav"), true, undefined, { dtw: true }).then(function (segs) {
    ok("tanınmayan -nfa: DTW'siz ikinci koşu, sonuç gelir", e.kosular.length === 2 && e.kosular[0].indexOf("-nfa") !== -1 && e.kosular[1].indexOf("-dtw") === -1 && segs.length === 3);
    ok("tanınmayan bayrak: kayıt nedeni 'bayrak:-nfa', günlükte", e.ayar.dtwKapali["turbo@cuda"].neden === "bayrak:-nfa" && gunlukte(e, /derleme '-nfa' tanımadı/));
  });
});
isler.push(function () {
  // DTW istenmeden gelen başka hata yeniden denenmez
  var e = ortam({ senaryo: function () { return { kod: 3221226505, stderr: "crash" }; } });
  return e.api.transcribeLocal(path.join(DIZIN, "d.wav"), false, undefined, {}).then(function () { ok("çökme hata vermeliydi", false); }, function (err) {
    ok("DTW'siz koşunun hatası aynen atılır (yeniden deneme yok), stderr hatada", e.kosular.length === 1 && /kod=3221226505/.test(err.message) && err.stderr === "crash");
  });
});
isler.push(function () {
  // -tr: Large'da verilir, İngilizce ipucu, algılanan dil "en", motor.cevrildi
  var trJson = JSON.parse(TR_JSON); trJson.params.translate = true;
  var e = ortam({ model: "large", ayar: { glossary: [{ from: "suflo", to: "Suflo" }] }, senaryo: function () { return { json: JSON.stringify(trJson) }; } });
  var motor = { cevir: true };
  return e.api.transcribeLocal(path.join(DIZIN, "e.wav"), false, undefined, motor).then(function () {
    var a = e.kosular[0];
    ok("çevrimdışı İngilizce: Large'da -tr, kaynak dil -l tr", a.indexOf("-tr") !== -1 && arg(a, "-l") === "tr", a.join(" "));
    ok("çeviride ipucu İngilizce çerçeveli (Türkçe cümle çözücüyü Türkçeye çekmesin)", arg(a, "--prompt") === "Names and terms: Suflo.", arg(a, "--prompt"));
    ok("çeviri: algılanan dil 'en', motor.cevrildi, günlükte ceviri=en ve -tr", e.api.dil() === "en" && motor.cevrildi === true && gunlukte(e, /ceviri=en/) && gunlukte(e, /^yerel motor bitti: .*, -tr$/));
  });
});
isler.push(function () {
  // Turbo'ya -tr asla verilmez: transcribeLocal reddeder
  var e = ortam({ model: "turbo" });
  return e.api.transcribeLocal(path.join(DIZIN, "f.wav"), false, undefined, { cevir: true }).then(function () { ok("Turbo çeviri reddedilmeliydi", false); }, function (err) {
    ok("Turbo + çeviri: motor hiç çalışmaz, model uyarısı", e.kosular.length === 0 && /Small ve Large/.test(err.message), err.message);
  });
});

/* ---------------- 2) yerelCalistir: DTW'de canlı satır yok ---------------- */
isler.push(function () {
  var e = ortam({ senaryo: function () { return { json: TR_JSON, stdout: "[00:00:00.000 --> 00:00:02.000]  canlı satır\n" }; } });
  e.api.canliBaslat();
  var ob = path.join(DIZIN, "g_w");
  return e.api.yerelCalistir("whisper-cli", ["-of", ob, "-dtw", "large.v3.turbo", "-nfa"], ob, "", { ofset: 0, carpan: 1, toplamSn: 60, onEk: "" }).then(function (segs) {
    ok("-dtw: stdout satırları canlı satır olmaz, ilerleme yüzdesi sürer", e.api.canli().satirlar.length === 0 && segs.length === 3 &&
      e.durumlar.some(function (d) { return /%\d+/.test(d); }), e.durumlar.join(" | "));
    var ob2 = path.join(DIZIN, "h_w");
    return e.api.yerelCalistir("whisper-cli", ["-of", ob2], ob2, "", { ofset: 0, carpan: 1, toplamSn: 60, onEk: "" });
  }).then(function () {
    ok("DTW'siz: canlı satır akar (değişmedi)", e.api.canli().satirlar.length === 1 && e.api.canli().satirlar[0].text === "canlı satır");
  });
});

/* ---------------- 3) motorSecenekDurumu: görünürlük ---------------- */
isler.push(function () {
  var e = ortam({ maxlen: "k1" });
  e.api.motorSecenekDurumu();
  ok("DTW: yerel motor + kelime kelime -> görünür", e.dom["cap-dtw-sar"].hidden === false);
  e.dom["cap-maxlen"].value = "w3"; e.api.motorSecenekDurumu();
  ok("DTW: N kelime modu da kelime tabanlı", e.dom["cap-dtw-sar"].hidden === false);
  e.dom["cap-maxlen"].value = "l42"; e.api.motorSecenekDurumu();
  ok("DTW: satır modu + stilsiz -> gizli", e.dom["cap-dtw-sar"].hidden === true && e.api.dtwSecili() === false);
  var e2 = ortam({ maxlen: "l42", stil: "karaoke", dtwKutu: true });
  e2.api.motorSecenekDurumu();
  ok("DTW: satır modunda kelime tabanlı Suflo Stili -> görünür ve seçili", e2.dom["cap-dtw-sar"].hidden === false && e2.api.dtwSecili() === true);
  var e3 = ortam({ maxlen: "l42", stil: "karaoke", mogrt: { path: "x.mogrt" }, dtwKutu: true });
  e3.api.motorSecenekDurumu();
  ok("DTW: MOGRT stili seçiliyken (satır modu) gizli", e3.dom["cap-dtw-sar"].hidden === true && e3.api.dtwSecili() === false);
  var e4 = ortam({ maxlen: "k1", yerel: false, dtwKutu: true, cevirKutu: true });
  e4.api.motorSecenekDurumu();
  ok("yerel motor yok: DTW ve çeviri satırı gizli, seçili sayılmaz", e4.dom["cap-dtw-sar"].hidden && e4.dom["cap-cevir-en-sar"].hidden && !e4.api.dtwSecili() && !e4.api.cevrimdisiCeviriSecili());
  var e5 = ortam({ maxlen: "k1", dtwKutu: true, ayar: { dtwKapali: { "turbo@cuda": { neden: "t_dtw" } } } });
  e5.api.motorSecenekDurumu();
  ok("DTW otomatik kapatılmışsa not ve 'Yeniden dene' görünür", e5.dom["cap-dtw-not"].hidden === false);
  var e6 = ortam({ maxlen: "k1", dtwKutu: true, derleme: "cpu", ayar: { dtwKapali: { "turbo@cuda": { neden: "t_dtw" } } } });
  e6.api.motorSecenekDurumu();
  ok("başka derlemede (CPU) not yok: kayıt model@derleme başına", e6.dom["cap-dtw-not"].hidden === true);
});
isler.push(function () {
  var e = ortam({ model: "turbo", kurulu: ["turbo", "large"], cevirKutu: true });
  e.api.motorSecenekDurumu();
  ok("çeviri satırı: yerel motor + dil tr -> görünür", e.dom["cap-cevir-en-sar"].hidden === false);
  ok("Turbo + işaretli: ipucu Turbo'yu açıklar, 'Large'a geç' (Large kurulu)", e.dom["cap-cevir-en-not"].hidden === false &&
    /Turbo çeviri için eğitilmedi/.test(e.dom["cap-cevir-en-not-metin"].textContent) && e.dom["cap-cevir-en-gec"].textContent === "Large'a geç" &&
    e.dom["cap-cevir-en-gec"].getAttribute("data-model") === "large");
  ok("Turbo + işaretli: engel var (go() kapıdan önce durur)", /Turbo/.test(e.api.cevrimdisiCeviriEngeli()) && e.api.cevrimdisiCeviriSecili() === true);
  e.api.ceviriModelineGec();
  ok("'Large'a geç': model ayarı large, kaydedilir, kurulum ve rehber tazelenir", e.ayar.model === "large" && e.kayit() > 0 && e.api.refreshSetupSayisi() === 1 && e.api.ayarOlay[0] === "model");
  var e2 = ortam({ model: "base", kurulu: ["base", "small"], cevirKutu: true });
  e2.api.motorSecenekDurumu();
  ok("Base + işaretli: genel model uyarısı, 'Small'a geç'", /Tiny ve Base/.test(e2.dom["cap-cevir-en-not-metin"].textContent) && e2.dom["cap-cevir-en-gec"].textContent === "Small'a geç");
  var e3 = ortam({ model: "turbo", kurulu: ["turbo"], cevirKutu: true });
  e3.api.motorSecenekDurumu();
  e3.api.ceviriModelineGec();
  ok("çeviri modeli kurulu değil: düğme Ayarlar'ı açar, model değişmez", e3.dom["cap-cevir-en-gec"].textContent === "Ayarlar'da model indir" &&
    e3.toastlar.indexOf("goster:settings") !== -1 && !e3.ayar.model);
  var e4 = ortam({ model: "turbo", cevirKutu: false });
  e4.api.motorSecenekDurumu();
  ok("işaretsizken ipucu yok (nag yok)", e4.dom["cap-cevir-en-not"].hidden === true && e4.api.cevrimdisiCeviriSecili() === false);
  var e5 = ortam({ model: "large", dil: "en", cevirKutu: true });
  e5.api.motorSecenekDurumu();
  ok("dil İngilizce: çeviri satırı gizli, seçili sayılmaz", e5.dom["cap-cevir-en-sar"].hidden === true && e5.api.cevrimdisiCeviriSecili() === false);
  var e6 = ortam({ model: "small", cevirKutu: true });
  e6.api.motorSecenekDurumu();
  ok("Small + işaretli: engel yok, ipucu gizli", e6.api.cevrimdisiCeviriEngeli() === "" && e6.dom["cap-cevir-en-not"].hidden === true && e6.api.cevrimdisiCeviriSecili() === true);
});

/* ---------------- 4) dosya adı eki ---------------- */
isler.push(function () {
  var e = ortam({});
  e.api.setSegments([{ start: 0, end: 1, text: "hello", cikisDili: "en" }]);
  ok("çevrimdışı İngilizce belge: .en eki (suflo-altyazi.en.srt)", e.api.dosyaDilEki() === ".en");
  e.api.setSegments([{ start: 0, end: 1, text: "hallo", orig: "hello", cikisDili: "en" }]);
  e.api.setCeviri("de");
  ok("LLM çevirisi öne geçer: .de", e.api.dosyaDilEki() === ".de");
  e.dom["cap-cift-dil"].checked = true;
  ok("çift dilli dışa aktarmada ek yok", e.api.dosyaDilEki() === "");
  e.api.setSegments([{ start: 0, end: 1, text: "merhaba" }]);
  e.api.setCeviri("");
  ok("normal belge: ek yok (suflo-altyazi.srt)", e.api.dosyaDilEki() === "");
});

/* ---------------- 5) go(), transcribeSuflo ve kaynak denetimleri ---------------- */
isler.push(function () {
  var g = govde("async function go(opts)");
  var kapi = g.indexOf('Pro.gate("offlineTranslate", { deneme: true, yeniden: function () { go(); } })');
  ok("go(): çeviri engeli kapıdan önce, kapı busy'den önce", g.indexOf("cevrimdisiCeviriEngeli()") > 0 && g.indexOf("cevrimdisiCeviriEngeli()") < kapi && kapi < g.indexOf("busy = true;"));
  ok("go(): örnek klip çevrilmez ve DTW almaz", /var cevirEn = !ornek && cevrimdisiCeviriSecili\(\);/.test(g) && /var dtwIste = !ornek && dtwSecili\(\);/.test(g));
  ok("go(): hak yalnız 'basarili = true' sonrasında ve catch'ten önce", g.indexOf('Pro.denemeHarca("offlineTranslate"') > g.indexOf("basarili = true;") &&
    g.indexOf('Pro.denemeHarca("offlineTranslate"') < g.search(/\n    \} catch \(/));
  ok("go(): çeviride transkript önbelleğe yazılmaz", /var onbMeta = \(!ornek && !cevirEn && scope === "clip" && clip\)/.test(g));
  ok("go(): tek klip ve toplu klip seçenekleri motora verir", /rotaSecenek\.cevir = cevirEn;/.test(g) && /rotaSecenek\.dtw = dtwIste;/.test(g) &&
    /var bSecenek = \{ cevir: cevirEn, dtw: dtwIste \};/.test(g) && /transcribeSuflo\(ba, bc\.dur, karaoke, tempFiles, bSecenek\)/.test(g));
  ok("go(): çevrilen satırlar cikisDili 'en' işaretini alır, algılanan dil en", /segments\.forEach\(function \(sg\) \{ sg\.cikisDili = "en"; \}\);\s*algilananDil = "en";/.test(g));
  var ts = govde("async function transcribeSuflo(");
  ok("transcribeSuflo: çeviride yerel motor şart ve bulut yedeğine geçilmez", /if \(secenek\.cevir && !localEngineReady\(\)\) throw new Error\(CEVIRI_YEREL_UYARISI\);/.test(ts) &&
    /if \(secenek\.cevir\) throw eLocal;/.test(ts) && ts.indexOf("if (secenek.cevir) throw eLocal;") < ts.indexOf("errors.push"));
  ok("panel açılışı: seçenek durumu Premiere'e sormaz", !/K\.call\(/.test(govde("function motorSecenekDurumu(")) && !/K\.call\(/.test(govde("function dtwUygun(")));
  var app = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8");
  ok("Ayarlar › Çözme: whisper-args ile normalize, açılışta kaydetmez", /el\("set-cozme"\)\.value = WAR \? WAR\.cozmeModu\(s\.cozme\) : "dogru";/.test(app) &&
    /K\.settings\(\)\.cozme = WAR \? WAR\.cozmeModu\(this\.value\) : this\.value;\s*K\.saveSettings\(\);/.test(app));
  var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
  ok("index.html: Çözme seçicisi (dogru varsayılan ilk), DTW anahtarı, çeviri satırı PRO rozetli", /<select id="set-cozme"[^>]*>\s*<option value="dogru">/.test(html) &&
    /id="cap-dtw-sar" hidden/.test(html) && /Hassas kelime zamanlaması \(DTW, biraz daha yavaş\)/.test(html) &&
    /id="cap-cevir-en-sar" hidden[\s\S]{0,400}İngilizceye çevir \(çevrimdışı\) <span class="pro-inline">PRO<\/span>/.test(html));
  var dm = require(path.join(KOK, "js", "deneme.js"));
  ok("deneme.js: offlineTranslate 3 haklı listede, Türkçe kısa adı var", dm.listede("offlineTranslate") && dm.kalan(dm.bos(), "offlineTranslate") === 3 && dm.AD.offlineTranslate === "Çevrimdışı İngilizce çeviri");
  var en = require(path.join(KOK, "i18n", "en.js"));
  var sozluk = en.strings || (en.default && en.default.strings) || {};
  ok("i18n: kısa ad ve Pro etiketi İngilizcede", !!sozluk["Çevrimdışı İngilizce çeviri"] && !!sozluk["Çevrimdışı İngilizce çeviri: internetsiz, yerel motorla"]);
});

(function sirayla(i) {
  if (i >= isler.length) {
    try { fs.readdirSync(DIZIN).forEach(function (f) { fs.unlinkSync(path.join(DIZIN, f)); }); fs.rmdirSync(DIZIN); } catch (e) {}
    console.log("\n" + gecen + "/" + toplam + " gecti");
    process.exit(gecen === toplam ? 0 : 1);
    return;
  }
  Promise.resolve().then(isler[i]).catch(function (e) { ok("iş " + i + " çöktü: " + (e && e.stack || e), false); }).then(function () { sirayla(i + 1); });
})(0);
