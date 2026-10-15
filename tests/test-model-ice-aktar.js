// Suflo testi: 3.4 adım 19 — çevrimdışı model içe aktarma (js/model-ice-aktar.js + KEngine.modelIceAktar)
var vm = require("vm"), fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
var ROOT = path.join(__dirname, "..");
var MI = require(path.join(ROOT, "js", "model-ice-aktar.js"));
var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

/* ---------------- saf modül ---------------- */

var GGML = [0x6c, 0x6d, 0x67, 0x67];   // "lmgg" = 0x67676d6c küçük-sonlu
var MB = 1048576;
ok("imza: ggml (LE 0x67676d6c) ve 1 MB üstü kabul", MI.basligiDenetle(GGML, MB + 1).ok === true);
ok("imza: Buffer da kabul", MI.basligiDenetle(Buffer.from(GGML), 200 * MB).ok === true);
ok("imza: ters bayt sırası (BE) reddedilir", MI.basligiDenetle([0x67, 0x67, 0x6d, 0x6c], 5 * MB).kod === "magic");
ok("imza: rastgele dosya reddedilir", MI.basligiDenetle(Buffer.from("MZ\x90\x00"), 5 * MB).kod === "magic");
ok("imza: GGUF ayrı ve anlaşılır iletiyle reddedilir", MI.basligiDenetle(Buffer.from("GGUF"), 5 * MB).kod === "gguf");
var lfs = Buffer.from("version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 574041195\n");
var dl = MI.basligiDenetle(lfs, lfs.length);
ok("Git-LFS işaretçisi reddedilir (lfs kodu, anlaşılır ileti)", dl.kod === "lfs" && /Git LFS/.test(dl.mesaj), dl.mesaj);
ok("tam 1 MB reddedilir (üstünde olmalı)", MI.basligiDenetle(GGML, MB).kod === "kucuk");
ok("ggml imzalı ama 1 MB altı da reddedilir", MI.basligiDenetle(GGML, 500000).kod === "kucuk");
ok("boyut sınırı: tam 4 GB kabul, 4 GB + 1 bayt reddedilir",
  MI.basligiDenetle(GGML, 4 * 1073741824).ok === true && MI.basligiDenetle(GGML, 4 * 1073741824 + 1).kod === "buyuk");
ok("eksik baş baytları okunamadı sayılır", MI.basligiDenetle([0x6c, 0x6d], 5 * MB).kod === "okunamadi");

var KATALOG = [
  { id: "tiny", file: "ggml-tiny-q5_1.bin" }, { id: "base", file: "ggml-base-q5_1.bin" },
  { id: "small", file: "ggml-small-q5_1.bin" }, { id: "turbo", file: "ggml-large-v3-turbo-q5_0.bin" },
  { id: "large", file: "ggml-large-v3-q5_0.bin" }
];
function kimlik(ad) { var x = MI.katalogEslestir(ad, KATALOG); return x ? x.id : null; }
ok("kimlik: katalog adları (nicemlenmiş) birebir", kimlik("ggml-large-v3-turbo-q5_0.bin") === "turbo" && kimlik("ggml-large-v3-q5_0.bin") === "large" && kimlik("ggml-small-q5_1.bin") === "small");
ok("kimlik: tam yol, büyük harf, tarayıcının ' (1)' eki, 'ggml-' öneki olmadan",
  kimlik("C:\\Users\\x\\Downloads\\GGML-Large-V3-Turbo-Q5_0 (1).bin") === "turbo" && kimlik("/tmp/large-v3-q5_0.bin") === "large" &&
  kimlik("ggml-tiny-q5_1 - Kopya.bin") === "tiny");
ok("kimlik: turbo ile large karışmaz", kimlik("ggml-large-v3-turbo-q5_0.bin") !== "large" && kimlik("ggml-large-v3-q5_0.bin") !== "turbo");
ok("kimlik: farklı nicemleme / f16 katalogda değil", kimlik("ggml-large-v3-turbo-q8_0.bin") === null && kimlik("ggml-large-v3-turbo.bin") === null && kimlik("ggml-base.bin") === null);
var aile = MI.aileTahmin("ggml-large-v3-turbo-q8_0.bin", KATALOG);
ok("aile tahmini: turbo q8_0 tanıdık aile olarak bilinir (uyarı metni için)", aile.id === "turbo" && aile.nicem === "q8_0" && aile.aile === "large-v3-turbo", JSON.stringify(aile));
ok("aile tahmini: bilinmeyen dosya", MI.aileTahmin("benim-modelim.bin", KATALOG).id === "");
ok("kimlik: .bin olmayan ad eşleşmez", kimlik("ggml-tiny-q5_1.bin.txt") === null && kimlik("") === null);
var oz = MI.ozelDosyaAdi("C:\\x\\Benim Türkçe Modelim!.BIN", KATALOG);
ok("özel ad: güvenli karakterler, ozel- öneki, katalogla çakışmaz", /^ozel-[a-z0-9._-]+\.bin$/.test(oz) && oz.indexOf("ozel-ozel-") === -1, oz);
ok("özel ad: ozel- önekli dosya çift önek almaz", MI.ozelDosyaAdi("ozel-x.bin", KATALOG) === "ozel-x.bin");
var liste = MI.ozelListeyeEkle([{ file: "ozel-a.bin", sizeMB: 3 }, { file: "../kotu.bin" }, null, { file: "ozel-b.bin", sizeMB: 9 }], { file: "ozel-a.bin", sizeMB: 5 });
ok("özel liste: bozuk/tehlikeli girdi atılır, aynı dosya bir kez (güncellenir)",
  liste.length === 2 && liste.filter(function (x) { return x.file === "ozel-a.bin"; })[0].sizeMB === 5 && !liste.some(function (x) { return /\.\./.test(x.file); }), JSON.stringify(liste));
var kayit = MI.ozelModelKaydi("ozel-x.bin", 300 * MB);
ok("özel kayıt: ozel: kimliği, Özel model etiketi, MB", kayit.id === "ozel:ozel-x.bin" && /^Özel model/.test(kayit.label) && kayit.sizeMB === 300 && kayit.ozel === true);
ok("onay metinleri: 'doğrulanmadı' ve Özel model uyarısı", /doğrulanmadı/.test(MI.dogrulanmadiSorusu("Turbo")) && /Özel model/.test(MI.ozelUyari("x.bin", aile)) && /katalogdaki sürümden farklı/.test(MI.ozelUyari("x.bin", aile)));
ok(".part eki indirmenin .part / .part.json dosyalarıyla çakışmaz", MI.PART_EKI === ".ice-aktar.part");

/* ---------------- KEngine.modelIceAktar (gerçek dosyalarla) ---------------- */

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-ice-aktar-"));
var WDIR = path.join(tmp, "whisper"), KAYNAK = path.join(tmp, "indirilenler");
fs.mkdirSync(KAYNAK, { recursive: true });
var MDIR = path.join(WDIR, "models");
var ayarlar = {}, kayitSayisi = 0, agac = null, sorular = [], cevaplar = {};
var K = {
  nodeOK: true, WIN: false, fs: fs, path: path,
  settings: function () { return ayarlar; }, saveSettings: function () { kayitSayisi++; return true; },
  log: function () {}, whisperDir: function () { return WDIR; },
  httpGet: async function () { return agac ? { status: 200, body: JSON.stringify(agac) } : { status: 0, body: "Error: getaddrinfo ENOTFOUND huggingface.co" }; }
};
var ctx = { require: require, console: console, K: K, Promise: Promise, JSON: JSON, Buffer: Buffer, setTimeout: setTimeout, clearTimeout: clearTimeout };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "model-ice-aktar.js"), "utf8"), ctx, { filename: "model-ice-aktar.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "engine.js"), "utf8"), ctx, { filename: "engine.js" });
var E = ctx.KEngine;
// Testte gerçek boyutlu (32-190 MB) dosya yazmamak için Tiny / Base / Small'un katalog boyutu 1 MB'a çekilir
// (KEngine.MODELS motorun kendi dizisi). Large / Turbo gerçek boyutta kalır: yarım dosya denetimi onlarla sınanır.
E.MODELS.forEach(function (m) { if (/^(tiny|base|small)$/.test(m.id)) m.sizeMB = 1; });
ok("boyut denetimi (saf): katalog boyutunun %85'i altı yarım sayılır", MI.katalogBoyutDenetle({ label: "Turbo — x", sizeMB: 574 }, 100 * MB).kod === "yarim" &&
  /Turbo için beklenenden küçük \(100 MB, beklenen ~574 MB\)/.test(MI.katalogBoyutDenetle({ label: "Turbo — x", sizeMB: 574 }, 100 * MB).mesaj) &&
  MI.katalogBoyutDenetle({ sizeMB: 574 }, 574 * MB).ok === true);

function modelVerisi(ek) {
  var b = Buffer.alloc(MB + 4096 + (ek || 0));
  for (var i = 4; i < b.length; i++) b[i] = (i * 7 + (ek || 0)) & 255;
  Buffer.from(GGML).copy(b, 0);
  return b;
}
function ozet(b) { return crypto.createHash("sha256").update(b).digest("hex"); }
function yaz(ad, b) { var p = path.join(KAYNAK, ad); fs.writeFileSync(p, b); return p; }
function onayla(tur, metin) { sorular.push(tur); return Promise.resolve(!!cevaplar[tur]); }
function parcalar() { try { return fs.readdirSync(MDIR).filter(function (f) { return /\.part$/.test(f); }); } catch (e) { return []; } }
async function hata(fn) { try { await fn(); return null; } catch (e) { return e; } }

(async function () {
  // 1) katalog modeli + doğru SHA-256 -> doğrulandı, .part kalmaz, kaynak dosya yerinde
  var tinyVeri = modelVerisi(1);
  var tinyKaynak = yaz("ggml-tiny-q5_1 (1).bin", tinyVeri);
  agac = [{ type: "file", path: "ggml-tiny-q5_1.bin", lfs: { oid: ozet(tinyVeri) } }];
  sorular = []; cevaplar = {};
  var r1 = await E.modelIceAktar(tinyKaynak, { onayla: onayla });
  var hedef1 = path.join(MDIR, "ggml-tiny-q5_1.bin");
  ok("katalog modeli SHA-256 ile doğrulanıp kurulur (dosya adından kimlik)", r1.ok && r1.id === "tiny" && r1.durum === "dogrulandi" &&
    fs.existsSync(hedef1) && Buffer.compare(fs.readFileSync(hedef1), tinyVeri) === 0, JSON.stringify(r1 && { ok: r1.ok, id: r1.id, durum: r1.durum }));
  ok("doğrulanan içe aktarmada soru sorulmaz, seçim modele geçer, kayıt tutulur",
    sorular.length === 0 && ayarlar.model === "tiny" && ayarlar.modelIceAktarma["ggml-tiny-q5_1.bin"] === "dogrulandi" && kayitSayisi > 0, sorular.join(","));
  ok("kullanıcının kaynak dosyasına dokunulmaz, .part kalmaz", fs.existsSync(tinyKaynak) && parcalar().length === 0, parcalar().join(","));

  // 2) doğrulanmış model SESSİZCE ezilmez: onay yoksa eski dosya aynen kalır
  var tinyBaska = yaz("ggml-tiny-q5_1.bin", modelVerisi(2));
  sorular = []; cevaplar = {};
  var r2 = await E.modelIceAktar(tinyBaska, { onayla: onayla });
  ok("hedef doluyken üzerine yazma onayı sorulur; hayır -> eski model aynen kalır",
    r2.ok === false && r2.vazgecildi && sorular.join(",") === "ustune-yaz" && Buffer.compare(fs.readFileSync(hedef1), tinyVeri) === 0 && parcalar().length === 0, sorular.join(","));

  // 3) SHA-256 uyuşmazlığı -> kurulmaz, .part silinir, eski model (onaylı üzerine yazmada bile) durur
  cevaplar = { "ustune-yaz": true }; sorular = [];
  var e3 = await hata(function () { return E.modelIceAktar(tinyBaska, { onayla: onayla }); });
  ok("SHA-256 uyuşmazsa hata, .part temizlenir, mevcut doğrulanmış model korunur",
    e3 && /SHA-256 uyuşmadı/.test(e3.message) && parcalar().length === 0 && Buffer.compare(fs.readFileSync(hedef1), tinyVeri) === 0 && fs.existsSync(tinyBaska),
    e3 && e3.message);

  // 4) çevrimdışı: özet bilinmiyor -> "doğrulanmadı" onayı; hayır -> .part silinir, kurulmaz
  agac = null;
  var baseVeri = modelVerisi(3);
  var baseKaynak = yaz("ggml-base-q5_1.bin", baseVeri);
  var hedef4 = path.join(MDIR, "ggml-base-q5_1.bin");
  sorular = []; cevaplar = {};
  var r4 = await E.modelIceAktar(baseKaynak, { onayla: onayla });
  ok("çevrimdışı: doğrulanmadı onayı sorulur; hayır -> kurulmaz, .part temizlenir",
    r4.ok === false && r4.vazgecildi && sorular.join(",") === "dogrulanmadi" && !fs.existsSync(hedef4) && parcalar().length === 0, sorular.join(","));
  cevaplar = { dogrulanmadi: true }; sorular = [];
  var r4b = await E.modelIceAktar(baseKaynak, { onayla: onayla });
  ok("çevrimdışı: onaylanırsa 'doğrulanmadı' olarak kurulur ve kaydedilir",
    r4b.ok && r4b.durum === "dogrulanmadi" && fs.existsSync(hedef4) && ayarlar.modelIceAktarma["ggml-base-q5_1.bin"] === "dogrulanmadi" && ayarlar.model === "base", JSON.stringify(r4b && r4b.durum));

  // 5) yarıda kalmış eski .ice-aktar.part başarılı içe aktarmada temizlenir
  agac = null;
  var smallVeri = modelVerisi(4);
  var smallKaynak = yaz("ggml-small-q5_1.bin", smallVeri);
  fs.writeFileSync(path.join(MDIR, "ggml-small-q5_1.bin" + MI.PART_EKI), "yarim kalmis");
  cevaplar = { dogrulanmadi: true };
  var r5 = await E.modelIceAktar(smallKaynak, { onayla: onayla });
  ok("eski yarım .part ezilir, sonunda hiç .part kalmaz, dosya birebir",
    r5.ok && parcalar().length === 0 && Buffer.compare(fs.readFileSync(path.join(MDIR, "ggml-small-q5_1.bin")), smallVeri) === 0, parcalar().join(","));

  // 6) LFS işaretçisi, imzasız dosya: kopyalama başlamadan reddedilir
  var lfsKaynak = yaz("ggml-large-v3-q5_0.bin", lfs);
  var e6 = await hata(function () { return E.modelIceAktar(lfsKaynak, { onayla: onayla }); });
  ok("Git-LFS işaretçisi içe aktarılmaz (dosya oluşmaz)", e6 && /Git LFS/.test(e6.message) && !fs.existsSync(path.join(MDIR, "ggml-large-v3-q5_0.bin")) && parcalar().length === 0, e6 && e6.message);
  var sahte = Buffer.alloc(2 * MB); sahte.write("MZ", 0);
  var e6b = await hata(function () { return E.modelIceAktar(yaz("ggml-large-v3-turbo-q5_0.bin", sahte), { onayla: onayla }); });
  ok("ggml imzası olmayan dosya reddedilir", e6b && /ggml imzası yok/.test(e6b.message) && !fs.existsSync(path.join(MDIR, "ggml-large-v3-turbo-q5_0.bin")), e6b && e6b.message);

  // 6c) katalog adı taşıyan ama yarım kalmış dosya (çevrimdışı "doğrulanmadı" ile bile) kopyalanmadan reddedilir
  sorular = []; cevaplar = { dogrulanmadi: true };
  var e6c = await hata(function () { return E.modelIceAktar(yaz("ggml-large-v3-q5_0.bin", modelVerisi(9)), { onayla: onayla }); });
  ok("yarım katalog modeli (beklenenin %85'i altı) soru sorulmadan reddedilir, dosya oluşmaz",
    e6c && /beklenenden küçük/.test(e6c.message) && sorular.length === 0 && !fs.existsSync(path.join(MDIR, "ggml-large-v3-q5_0.bin")) && parcalar().length === 0, e6c && e6c.message);

  // 7) bilinmeyen ggml dosyası yalnız onayla, Özel model olarak
  var ozelVeri = modelVerisi(5);
  var ozelKaynak = yaz("ggml-large-v3-turbo-q8_0.bin", ozelVeri);
  sorular = []; cevaplar = {};
  var r7 = await E.modelIceAktar(ozelKaynak, { onayla: onayla });
  ok("bilinmeyen ggml: Özel model uyarısı; hayır -> hiçbir şey kurulmaz", r7.ok === false && sorular.join(",") === "ozel" && !(ayarlar.ozelModeller || []).length, sorular.join(","));
  cevaplar = { ozel: true }; sorular = [];
  var r7b = await E.modelIceAktar(ozelKaynak, { onayla: onayla });
  var ozelHedef = path.join(MDIR, "ozel-ggml-large-v3-turbo-q8_0.bin");
  ok("bilinmeyen ggml onayla Özel model olarak eklenir (SHA-256 sorulmaz, katalog adı kullanılmaz)",
    r7b.ok && r7b.durum === "ozel" && r7b.id === "ozel:ozel-ggml-large-v3-turbo-q8_0.bin" && fs.existsSync(ozelHedef) &&
    !fs.existsSync(path.join(MDIR, "ggml-large-v3-turbo-q5_0.bin")) && sorular.join(",") === "ozel", JSON.stringify(r7b && { id: r7b.id, durum: r7b.durum }));
  var kurulu = E.installedModels().map(function (m) { return m.id; });
  ok("Özel model kurulu listede, seçili ve modelById ile bulunur", kurulu.indexOf("ozel:ozel-ggml-large-v3-turbo-q8_0.bin") !== -1 &&
    E.activeModel().id === "ozel:ozel-ggml-large-v3-turbo-q8_0.bin" && E.modelById("ozel:ozel-ggml-large-v3-turbo-q8_0.bin").ozel === true, kurulu.join(","));
  fs.unlinkSync(ozelHedef);
  var e7 = await hata(function () { return E.installModel("ozel:ozel-ggml-large-v3-turbo-q8_0.bin"); });
  ok("silinen Özel model indirilmeye çalışılmaz, yeniden içe aktarma söylenir", e7 && /içe aktar/.test(e7.message), e7 && e7.message);

  // 8) model klasöründeki dosyanın kendisi seçilirse hiçbir şey silinmez
  var e8 = await hata(function () { return E.modelIceAktar(hedef1, { onayla: function () { return Promise.resolve(true); } }); });
  ok("model klasöründeki dosyanın kendisi seçilince silinmez", e8 && /zaten/.test(e8.message) && fs.existsSync(hedef1) && Buffer.compare(fs.readFileSync(hedef1), tinyVeri) === 0, e8 && e8.message);

  // 8b) üzerine yazmada .part yerine konamazsa (Windows: antivirüs yeni dosyayı tutuyor, EPERM)
  // doğrulanmış eski model SİLİNMİŞ olmamalı: hedef önceden silinmez, rename tek adımda değiştirir
  var gercekFs = K.fs;
  var renameDene = 0;
  K.fs = Object.create(gercekFs);
  K.fs.renameSync = function () { renameDene++; var e = new Error("EPERM: operation not permitted, rename"); e.code = "EPERM"; throw e; };
  agac = [{ type: "file", path: "ggml-tiny-q5_1.bin", lfs: { oid: ozet(tinyVeri) } }];
  var tinyYeniden = yaz("ggml-tiny-q5_1-yeniden.bin", tinyVeri);
  fs.renameSync(tinyYeniden, path.join(KAYNAK, "ggml-tiny-q5_1 (2).bin"));
  cevaplar = { "ustune-yaz": true }; sorular = [];
  var e8b = await hata(function () { return E.modelIceAktar(path.join(KAYNAK, "ggml-tiny-q5_1 (2).bin"), { onayla: onayla }); });
  K.fs = gercekFs;
  ok("üzerine yazmada taşıma düşerse eski doğrulanmış model yerinde kalır, .part temizlenir (kısa yeniden denemeyle)",
    e8b && /EPERM/.test(e8b.message) && fs.existsSync(hedef1) && Buffer.compare(fs.readFileSync(hedef1), tinyVeri) === 0 &&
    parcalar().length === 0 && renameDene === 4, (e8b && e8b.message) + " dene=" + renameDene);
  // geçici kilit (ilk deneme EPERM) kısa beklemeyle aşılır
  renameDene = 0;
  K.fs = Object.create(gercekFs);
  K.fs.renameSync = function (a, b) {
    renameDene++;
    if (renameDene === 1) { var e = new Error("EBUSY: resource busy or locked"); e.code = "EBUSY"; throw e; }
    return gercekFs.renameSync(a, b);
  };
  var r8c = await E.modelIceAktar(path.join(KAYNAK, "ggml-tiny-q5_1 (2).bin"), { onayla: onayla });
  K.fs = gercekFs;
  ok("geçici EBUSY'de taşıma yeniden denenir ve içe aktarma tamamlanır", r8c.ok && renameDene === 2 && parcalar().length === 0 &&
    Buffer.compare(fs.readFileSync(hedef1), tinyVeri) === 0, renameDene);

  // 8d) dosyası silinmiş Özel model kurulumda seçilmez (her onarım motoru kurup modelde düşmesin)
  ok("kurulum modeli: dosyası olmayan Özel model yerine katalog varsayılanı (Turbo)",
    E.kurulumModeli("ozel:ozel-ggml-large-v3-turbo-q8_0.bin").id === "turbo" && E.kurulumModeli("tiny").id === "tiny" && E.kurulumModeli("yok").id === "turbo");
  ok("kısa ad: Özel model dosya adıyla, katalog modeli etiketin başıyla",
    E.modelKisaAdi(MI.ozelModelKaydi("ozel-ggml-large-v3-turbo-q8_0.bin", 900 * MB)) === "ggml-large-v3-turbo-q8_0" &&
    E.modelKisaAdi(E.modelById("tiny")) === "Tiny");

  // 8e) "doğrulanmadı" işareti okunur; Doctor "Doğrula" internet varken SHA-256'yı denetler.
  // Yeni motor bağlamı: HF ağaç önbelleği ilk adımın ağacıyla dolu, burada her senaryo kendi ağacını ister
  var httpArgs = [];
  var K2 = Object.create(K);
  K2.httpGet = function (u, h, s) { httpArgs.push(s || null); return K.httpGet(u, h, s); };
  function yeniMotor() {
    var c = { require: require, console: console, K: K2, Promise: Promise, JSON: JSON, Buffer: Buffer, setTimeout: setTimeout, clearTimeout: clearTimeout };
    c.window = c;
    vm.createContext(c);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "model-ice-aktar.js"), "utf8"), c, { filename: "model-ice-aktar.js" });
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "engine.js"), "utf8"), c, { filename: "engine.js" });
    c.KEngine.MODELS.forEach(function (m) { if (/^(tiny|base|small)$/.test(m.id)) m.sizeMB = 1; });
    return c.KEngine;
  }
  var E2 = yeniMotor();
  ok("'doğrulanmadı' işareti okunur: Base listede doğrulanmamış, Tiny değil",
    E2.dogrulanmadiMi(E2.modelById("base")) === true && E2.dogrulanmadiMi(E2.modelById("tiny")) === false &&
    E2.dogrulanmamisModeller().map(function (m) { return m.id; }).indexOf("base") !== -1, JSON.stringify(ayarlar.modelIceAktarma));
  agac = null;
  var dv1 = await E2.modelYenidenDogrula("base");
  ok("Doğrula: huggingface.co'ya yine ulaşılamazsa 'bilinmiyor', işaret kalır, dosya kalır",
    dv1.durum === "bilinmiyor" && E2.dogrulanmadiMi(E2.modelById("base")) && fs.existsSync(hedef4));
  ok("model özeti isteği duvar saati sınırlı ve sistem köklerine izinli (çevrimdışı içe aktarma 21-75 sn askıda kalmasın)",
    httpArgs.length > 0 && httpArgs.every(function (s) { return s && s.timeout > 0 && s.timeout <= 20000 && s.sistemKokleri === true; }), JSON.stringify(httpArgs));
  var E3 = yeniMotor();
  agac = [{ type: "file", path: "ggml-base-q5_1.bin", lfs: { oid: ozet(baseVeri) } }, { type: "file", path: "ggml-small-q5_1.bin", lfs: { oid: ozet(Buffer.from("baska")) } }];
  var dv2 = await E3.modelYenidenDogrula("base");
  ok("Doğrula: SHA-256 tutunca işaret kalkar, dosya yerinde", dv2.durum === "dogrulandi" && !E3.dogrulanmadiMi(E3.modelById("base")) &&
    fs.existsSync(hedef4) && !Object.prototype.hasOwnProperty.call(ayarlar.modelIceAktarma, "ggml-base-q5_1.bin"), JSON.stringify(ayarlar.modelIceAktarma));
  var dv3 = await E3.modelYenidenDogrula("small");
  ok("Doğrula: SHA-256 uyuşmazsa dosya silinir (bozuk / değiştirilmiş model kullanılmaz), işaret kalkar",
    dv3.durum === "uyusmadi" && !fs.existsSync(path.join(MDIR, "ggml-small-q5_1.bin")) && !E3.dogrulanmadiMi(E3.modelById("small")));

  // 8f) iki aynada farklı hatalar: huggingface.co'nun DNS filtresi teşhisi sonraki aynanın hatasıyla ezilmez;
  // model indirme hatası çevrimdışı içe aktarmayı önermek için işaretlenir
  var indirilen = [];
  K2.download = async function (u) {
    indirilen.push(u);
    if (/huggingface\.co/.test(u)) return { ok: false, error: "HTTP 503 — Kurumsal ağ filtresi huggingface.co adresini engelliyor (Cisco Umbrella, 146.112.61.106).", dnsEngeli: "146.112.61.106" };
    return { ok: false, error: "Error: connect ETIMEDOUT 104.21.0.1:443" };
  };
  var E4 = yeniMotor();
  var e8f = await hata(function () { return E4.installModel("large"); });
  delete K2.download;
  ok("iki ayna: DNS filtresi teşhisi korunur, sonraki aynanın hatası da yazılır, içe aktarma işareti",
    e8f && /Kurumsal ağ filtresi huggingface\.co adresini engelliyor \(Cisco Umbrella/.test(e8f.message) && /ETIMEDOUT/.test(e8f.message) &&
    e8f.modelIceAktarOner === true && indirilen.length === 2, e8f && e8f.message);

  // 8g) 3.4 inceleme: yarıda kalan içe aktarma (panel yeniden yüklendi / Premiere kapandı) .part bırakmaz
  var eskiParca = path.join(MDIR, "ggml-large-v3.bin.ice-aktar.part"), tazeParca = path.join(MDIR, "ggml-medium.bin.ice-aktar.part");
  fs.writeFileSync(eskiParca, "x"); fs.writeFileSync(tazeParca, "y");
  var ikiSaatOnce = new Date(Date.now() - 2 * 3600000);
  fs.utimesSync(eskiParca, ikiSaatOnce, ikiSaatOnce);
  var E5 = yeniMotor();
  E5.installedModels();
  ok("yeni oturumun ilk model listelemesi 1 saatten eski içe aktarma parçasını siler, tazesine (süren kopya) dokunmaz",
    !fs.existsSync(eskiParca) && fs.existsSync(tazeParca));
  fs.utimesSync(tazeParca, ikiSaatOnce, ikiSaatOnce);
  E5.installedModels();
  var tazeKaldi = fs.existsSync(tazeParca);
  var e8g = await hata(function () { return E5.modelIceAktar(hedef1, { onayla: onayla }); });
  ok("listeleme oturumda bir kez temizler; içe aktarma başlarken eski parçalar yine silinir",
    tazeKaldi && e8g && !fs.existsSync(tazeParca) && parcalar().length === 0, e8g && e8g.message);

  // 8g) Doctor sınaması motor kaynağı: macOS'ta motor Homebrew'dan (ghcr.io), Windows'ta GitHub arşivinden
  K.MAC = true;
  var macAdres = E.motorKaynakAdresi();
  K.MAC = false;
  ok("motor kaynağı: macOS ghcr.io (Homebrew paketleri), Windows github.com",
    macAdres === "https://ghcr.io/" && /^https:\/\/github\.com\//.test(E.motorKaynakAdresi()), macAdres);

  // 8h) Ayarlar › Motor satırı: içe aktarılan model motor yokken "hazır" sayılmaz
  var dYok = MI.yerelDurum({ ad: "Turbo", motorVar: false, donanim: "CPU" });
  var dVar = MI.yerelDurum({ ad: "Turbo", motorVar: true, donanim: "CPU", vad: true });
  var dDog = MI.yerelDurum({ ad: "Base", motorVar: true, donanim: "CPU", dogrulanmadi: true });
  ok("motor durumu: model var motor yok -> '✓' yok, uyarı, düğme kurar",
    dYok.sinif === "warn" && dYok.metin.indexOf("✓") === -1 && /motor kurulu değil/.test(dYok.metin) && dYok.dugme === "İndir & kur", JSON.stringify(dYok));
  ok("motor durumu: ikisi de var -> ✓, Değiştir; doğrulanmamış model uyarı rengiyle 'doğrulanmadı'",
    dVar.sinif === "good" && dVar.metin === "✓ Turbo · CPU · VAD" && dVar.dugme === "Değiştir" &&
    dDog.sinif === "warn" && /· doğrulanmadı$/.test(dDog.metin) && MI.yerelDurum({}).metin === "kurulu değil", dVar.metin + " | " + dDog.metin);
  ok("app.js: motor satırı yerelDurum'a ve whisperLocal({ skipModel: true })'a bakar",
    /SufloModelIceAktar\.yerelDurum\(/.test(fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8")) &&
    /K\.whisperLocal\(\{ skipModel: true \}\)/.test(fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8")));

  // 9) panel bağlantısı: betik sırası, düğme, dosya seçici süzgeci, i18n
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var app = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  ok("index: model-ice-aktar.js engine.js'ten, ag-dayanim.js bridge.js'ten önce yüklenir",
    html.indexOf('src="js/model-ice-aktar.js"') !== -1 && html.indexOf('src="js/model-ice-aktar.js"') < html.indexOf('src="js/engine.js"') &&
    html.indexOf('src="js/ag-dayanim.js"') !== -1 && html.indexOf('src="js/ag-dayanim.js"') < html.indexOf('src="js/bridge.js"'));
  ok("Ayarlar › Motor: 'Model dosyası içe aktar' düğmesi ve .bin süzgeçli seçici",
    /id="set-model-ice"[^>]*>Model dosyası içe aktar</.test(html) && /showOpenDialogEx\(false, false, uiMetni\("Whisper model dosyasını seç \(\.bin\)"\), "", \["bin"\]\)/.test(app));
  ok("içe aktarma ücretsiz: Pro kapısı yok", !/Pro\.gate\([^)]*\)[\s\S]{0,200}modelIceAktar|modelDosyasiIceAktar[\s\S]{0,1500}Pro\.gate/.test(app));
  var en = fs.readFileSync(path.join(ROOT, "i18n", "en.js"), "utf8");
  ok("i18n: düğme, ipucu ve onay metinleri İngilizce sözlükte",
    ["Model dosyası içe aktar", "Whisper model dosyasını seç (.bin)", "Model kaynaklarını sına"].every(function (k) { return en.indexOf('"' + k + '"') !== -1; }));
  var verify = fs.readFileSync(path.join(ROOT, "tools", "verify-release.ps1"), "utf8");
  ok("paket denetimi yeni modülleri ister", /js\/ag-dayanim\\\.js/.test(verify) && /js\/model-ice-aktar\\\.js/.test(verify));

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL kosum: " + (e && e.stack ? e.stack : e)); process.exit(1); });
