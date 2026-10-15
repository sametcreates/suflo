// Suflo testi: Yapay zekâ köprüsü (MCP) panel sunucusu — js/otomasyon-sunucu.js
// Gerçek loopback sunucusu (Node): jeton, Host, tarayıcı başlıkları, yöntem, gövde sınırı,
// hız ve kuyruk sınırı, bağlantı dosyası (0600, kapanışta silinir), düzenleme izni,
// yıkıcı eylem onayı (zaman aşımında ret), Pro kapısı (pro_gerekli, hak harcanmaz).
var fs = require("fs"), os = require("os"), path = require("path"), http = require("http"), net = require("net"), cp = require("child_process");
var S = require(path.join(__dirname, "..", "js", "otomasyon-sunucu.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }

var dizin = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-mcp-"));
var dosya = path.join(dizin, "Kesit", "otomasyon.json");

function istek(port, o) {
  o = o || {};
  return new Promise(function (resolve) {
    var govde = o.govde === undefined ? JSON.stringify({ ad: "suflo_baglam", args: {} }) : o.govde;
    var h = {
      "Host": "127.0.0.1:" + port,
      "Content-Type": "application/json",
      "Authorization": "Bearer " + o.token
    };
    if (o.basliklar) for (var k in o.basliklar) { if (o.basliklar[k] === null) delete h[k]; else h[k] = o.basliklar[k]; }
    if (govde !== null) h["Content-Length"] = Buffer.byteLength(govde);
    var r = http.request({ host: "127.0.0.1", port: port, method: o.yontem || "POST", path: o.yol || "/v1/eylem", headers: h, setHost: false }, function (res) {
      var p = [];
      res.on("data", function (c) { p.push(c); });
      res.on("end", function () {
        var j = null;
        try { j = JSON.parse(Buffer.concat(p).toString("utf8")); } catch (e) {}
        resolve({ kod: res.statusCode, govde: j, basliklar: res.headers });
      });
    });
    r.on("error", function (e) { resolve({ kod: 0, hata: e }); });
    if (govde !== null) r.end(govde); else r.end();
  });
}

function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Ham TCP soketi (HTTP isteği değil): bağlanır, isterse bir şey yazar
function soketAc(port, yaz) {
  return new Promise(function (resolve) {
    var sk = net.connect(port, "127.0.0.1", function () { if (yaz) sk.write(yaz); resolve(sk); });
    sk.on("error", function () {});
  });
}
// Soket kapanınca geçen ms; ms içinde kapanmazsa -1
function kapaninca(sk, ms) {
  return new Promise(function (resolve) {
    var bas = Date.now();
    var t = setTimeout(function () { resolve(-1); }, ms);
    sk.on("close", function () { clearTimeout(t); resolve(Date.now() - bas); });
  });
}

async function main() {
  var cagrilar = [], kayitlar = [], harcanan = [], onaylar = [];
  var izin = { duzenleme: false, onay: true };
  var proDurum = { cut: { ok: false } };
  var onayYaniti = null;   // null: hiç yanıt verme (zaman aşımı)
  var kapanma = [];
  var sunucu = S.olustur({
    dosya: dosya,
    onaySuresi: 300,
    yurut: function (ad, args, baglam) {
      cagrilar.push([ad, args, baglam]);
      if (ad === "suflo_doktor") return new Promise(function (r) { setTimeout(function () { r({ ok: true }); }, 400); });
      if (ad === "suflo_secim") return { ok: true, klipler: [{ name: "a", mediaPath: "/Users/x/Movies/gizli.mov" }] };
      if (ad === "suflo_sessizlik_analiz") { harcanan.push("cut"); return { ok: true, araliklar: [] }; }
      if (ad === "suflo_altyazi_kanala") return { ok: false, error: "Aktif sequence yok." };
      return { ok: true, ad: ad };
    },
    izinler: function () { return izin; },
    onayIste: function (ad, args, ozet) { onaylar.push([ad, ozet]); return onayYaniti === null ? new Promise(function () {}) : Promise.resolve(onayYaniti); },
    proIzin: function (f) { return proDurum[f] || { ok: false }; },
    kayit: function (k) { kayitlar.push(k); },
    onKapandi: function (n) { kapanma.push(n); }
  });
  var r0 = await sunucu.baslat();
  var port = r0.port, token = sunucu._token();
  ok("rastgele port, 64 haneli onaltılık jeton", port > 0 && /^[0-9a-f]{64}$/.test(token));

  /* ---- bağlantı dosyası ---- */
  var b = JSON.parse(fs.readFileSync(dosya, "utf8"));
  ok("otomasyon.json: v, port, token, pid, baslangic", b.v === 1 && b.port === port && b.token === token && b.pid === process.pid && !isNaN(Date.parse(b.baslangic)), js(b));
  if (process.platform !== "win32") ok("otomasyon.json modu 0600 (POSIX)", (fs.statSync(dosya).mode & 511) === 384, (fs.statSync(dosya).mode & 511).toString(8));
  ok("geçici dosya kalmaz", fs.readdirSync(path.dirname(dosya)).length === 1, fs.readdirSync(path.dirname(dosya)).join(","));

  /* ---- yalnız 127.0.0.1 ---- */
  var ifs = os.networkInterfaces(), dis = null;
  Object.keys(ifs).forEach(function (n) { (ifs[n] || []).forEach(function (a) { if (!dis && a.family === "IPv4" && !a.internal) dis = a.address; }); });
  if (dis) {
    var disSonuc = await new Promise(function (resolve) {
      var r = http.request({ host: dis, port: port, method: "POST", path: "/v1/eylem" }, function () { resolve("baglandi"); });
      r.on("error", function (e) { resolve(e.code); });
      r.setTimeout(2000, function () { r.destroy(); resolve("zaman"); });
      r.end("{}");
    });
    ok("dış arayüzden bağlanılamaz (0.0.0.0'a bağlı değil)", disSonuc !== "baglandi", disSonuc);
  }
  ok("kaynak: listen(0, '127.0.0.1'), 0.0.0.0 yok", /\.listen\(0, "127\.0\.0\.1"/.test(fs.readFileSync(path.join(__dirname, "..", "js", "otomasyon-sunucu.js"), "utf8")) &&
    !/0\.0\.0\.0"/.test(fs.readFileSync(path.join(__dirname, "..", "js", "otomasyon-sunucu.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));

  /* ---- kimlik ---- */
  var r = await istek(port, { token: token });
  ok("doğru jetonla okuma eylemi 200", r.kod === 200 && r.govde.ok === true && r.govde.sonuc.ad === "suflo_baglam", js(r.govde));
  r = await istek(port, { token: null, basliklar: { Authorization: null } });
  ok("jetonsuz 401", r.kod === 401 && r.govde.hata === "jeton");
  r = await istek(port, { token: token.slice(0, 63) + (token[63] === "a" ? "b" : "a") });
  ok("yanlış jeton 401", r.kod === 401);
  r = await istek(port, { token: token + "00" });
  ok("farklı uzunlukta jeton 401", r.kod === 401);
  r = await istek(port, { token: token, basliklar: { Authorization: "Basic " + token } });
  ok("Bearer dışı şema 401", r.kod === 401);

  /* ---- tarayıcı / DNS rebinding ---- */
  r = await istek(port, { token: token, basliklar: { Origin: "https://kotu.example" } });
  ok("Origin varsa 403", r.kod === 403);
  r = await istek(port, { token: token, basliklar: { Referer: "https://kotu.example/" } });
  ok("Referer varsa 403", r.kod === 403);
  r = await istek(port, { token: token, basliklar: { "Sec-Fetch-Mode": "no-cors" } });
  ok("Sec-Fetch-* varsa 403", r.kod === 403);
  r = await istek(port, { token: token, basliklar: { Upgrade: "websocket", Connection: "Upgrade" } });
  ok("WebSocket yükseltmesi 403 / bağlantı kurulamaz", r.kod === 403 || r.kod === 0, r.kod);
  r = await istek(port, { token: token, basliklar: { Host: "kotu.example:" + port } });
  ok("yanlış Host 403", r.kod === 403);
  r = await istek(port, { token: token, basliklar: { Host: "localhost:" + port } });
  ok("localhost Host da 403 (tam eşleşme 127.0.0.1:<port>)", r.kod === 403);
  r = await istek(port, { token: token, yontem: "OPTIONS", govde: null });
  var corsYok = Object.keys(r.basliklar || {}).every(function (k) { return !/^access-control-/i.test(k); });
  ok("OPTIONS 403, CORS başlığı yok", r.kod === 403 && corsYok, js(r.basliklar));
  r = await istek(port, { token: token, yontem: "GET", govde: null });
  ok("GET 405", r.kod === 405);
  r = await istek(port, { token: token, yol: "/v1/baska" });
  ok("başka yol 404", r.kod === 404);
  r = await istek(port, { token: token, yol: "/v1/eylem?x=1" });
  ok("sorgu dizesi 404", r.kod === 404);
  r = await istek(port, { token: token, basliklar: { "Content-Type": "text/plain" } });
  ok("Content-Type application/json değilse 415 (form POST)", r.kod === 415);
  r = await istek(port, { token: token, basliklar: { "Content-Type": "application/x-www-form-urlencoded" } });
  ok("form-urlencoded 415", r.kod === 415);
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "x", args: {}, dolgu: new Array(270 * 1024).join("a") }) });
  ok("256 KB üstü gövde 413", r.kod === 413, r.kod);
  r = await istek(port, { token: token, govde: "{bozuk" });
  ok("bozuk JSON 400", r.kod === 400 && r.govde.hata === "json");

  /* ---- doğrulama ---- */
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "execute_extendscript", args: { code: "app.quit()" } }) });
  ok("listede olmayan eylem 404 bilinmeyen_eylem, yürütülmez", r.kod === 404 && r.govde.hata === "bilinmeyen_eylem" && !cagrilar.some(function (c) { return c[0] === "execute_extendscript"; }));
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_baglam", args: { yol: "C:\\" } }) });
  ok("bilinmeyen anahtar 400", r.kod === 400 && r.govde.hata === "gecersiz");

  /* ---- çıktı temizliği ---- */
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_secim", args: {} }) });
  ok("yanıtta mutlak yol yok (dosya adı)", r.govde.sonuc.klipler[0].mediaPath === "gizli.mov", js(r.govde));
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_altyazi_kanala", args: {} }) });
  ok("yazma eylemi düzenleme izni kapalıyken 403 izin_yok, yürütülmez", r.kod === 403 && r.govde.hata === "izin_yok" && !cagrilar.some(function (c) { return c[0] === "suflo_altyazi_kanala"; }));
  izin.duzenleme = true;
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_altyazi_kanala", args: {} }) });
  ok("izin açıkken eylemin kendi hatası ok:false olarak döner", r.kod === 200 && r.govde.ok === false && /Aktif sequence/.test(r.govde.mesaj), js(r.govde));

  /* ---- Pro kapısı ---- */
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_sessizlik_analiz", args: {} }) });
  ok("Pro yoksa ve hak yoksa 402 pro_gerekli, yürütülmez, hak harcanmaz", r.kod === 402 && r.govde.hata === "pro_gerekli" && harcanan.length === 0 && !cagrilar.some(function (c) { return c[0] === "suflo_sessizlik_analiz"; }), js(r.govde));
  proDurum.cut = { ok: true, deneme: true };
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_sessizlik_analiz", args: { esik_db: -40 } }) });
  var son = cagrilar[cagrilar.length - 1];
  ok("deneme hakkı varsa yürütülür, yürütücüye deneme: true geçer", r.kod === 200 && son[0] === "suflo_sessizlik_analiz" && son[2].deneme === true && son[1].esik_db === -40);

  /* ---- yıkıcı eylem onayı ---- */
  proDurum.cut = { ok: true, deneme: false };
  onayYaniti = null;
  var bas = Date.now();
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_sessizlik_kes", args: {} }) });
  ok("onay gelmezse zaman aşımında reddedilir, yürütülmez", r.kod === 403 && r.govde.hata === "reddedildi" && Date.now() - bas >= 250 &&
    !cagrilar.some(function (c) { return c[0] === "suflo_sessizlik_kes"; }) && onaylar[0][1] === "Sessizlikleri kes (kopyada)", js(r.govde));
  onayYaniti = false;
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_sessizlik_kes", args: {} }) });
  ok("Reddet: 403 reddedildi", r.kod === 403 && r.govde.hata === "reddedildi");
  onayYaniti = true;
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_sessizlik_kes", args: {} }) });
  ok("Onayla: yürütülür", r.kod === 200 && r.govde.ok === true && cagrilar.some(function (c) { return c[0] === "suflo_sessizlik_kes"; }));
  izin.onay = false;
  var onaySayisi = onaylar.length;
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_sessizlik_kes", args: {} }) });
  ok("'Yıkıcı eylemlerde onay iste' kapalıyken kart sorulmaz", r.kod === 200 && onaylar.length === onaySayisi);
  izin.onay = true;
  izin.duzenleme = false;
  r = await istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_sessizlik_kes", args: {} }) });
  ok("yıkıcı eylem de düzenleme izni ister (onay kartından önce)", r.kod === 403 && r.govde.hata === "izin_yok" && onaylar.length === onaySayisi);

  /* ---- etkinlik kaydı ---- */
  ok("her çağrı kaydedilir (ad, sonuç, kod)", kayitlar.length >= 10 && kayitlar.some(function (k) { return k.ad === "suflo_sessizlik_kes" && k.kod === "reddedildi"; }) &&
    kayitlar.some(function (k) { return k.ad === "suflo_baglam" && k.sonuc === "ok"; }));

  /* ---- kuyruk: aynı anda tek eylem, en çok 4 bekleyen ---- */
  var once = cagrilar.length;
  var paralel = [];
  for (var i = 0; i < 6; i++) paralel.push(istek(port, { token: token, govde: JSON.stringify({ ad: "suflo_doktor", args: {} }) }));
  var sonuclar = await Promise.all(paralel);
  var kodlar = sonuclar.map(function (x) { return x.kod; }).sort();
  ok("1 çalışan + 4 kuyruk, 6. istek 429", js(kodlar) === js([200, 200, 200, 200, 200, 429]), js(kodlar));
  ok("eylemler sırayla (eşzamanlı değil) yürütüldü", cagrilar.length - once === 5);

  /* ---- jeton yenileme ---- */
  var eski = token;
  var yenileSonuc = sunucu.jetonYenile();
  ok("Yeni jeton başarıda { ok: true } döner", yenileSonuc && yenileSonuc.ok === true, js(yenileSonuc));
  token = sunucu._token();
  r = await istek(port, { token: eski });
  var r2 = await istek(port, { token: token });
  ok("Yeni jeton: eskisi 401, dosya güncellendi", r.kod === 401 && r2.kod === 200 && token !== eski && JSON.parse(fs.readFileSync(dosya, "utf8")).token === token);

  /* ---- kapanış ---- */
  sunucu.durdur("kapat");
  ok("durdur: bağlantı dosyası silinir", !fs.existsSync(dosya));
  r = await istek(port, { token: token });
  ok("durdur: port artık dinlemiyor", r.kod === 0);
  ok("onKapandi bildirilir", kapanma[0] === "kapat");

  /* ---- hız sınırı ---- */
  var hizli = S.olustur({ dosya: dosya, dakikaSiniri: 5, yurut: function () { return { ok: true }; } });
  var hp = (await hizli.baslat()).port, ht = hizli._token();
  var hk = [];
  for (var q = 0; q < 7; q++) hk.push((await istek(hp, { token: ht })).kod);
  ok("dakika sınırı aşılınca 429", js(hk) === js([200, 200, 200, 200, 200, 429, 429]), js(hk));
  ok("varsayılan sınır dakikada 120", S.DAKIKA_SINIRI === 120 && S.KUYRUK_SINIRI === 4 && S.GOVDE_SINIRI === 256 * 1024 && S.ONAY_SURESI === 60000 && S.BOSTA_KAPANMA === 30 * 60000);
  hizli.durdur();

  /* ---- boşta kapanma ---- */
  var bosta = [];
  var bs = S.olustur({ dosya: dosya, bostaKapanma: 200, yurut: function () { return { ok: true }; }, onKapandi: function (n) { bosta.push(n); } });
  await bs.baslat();
  await bekle(450);
  ok("çağrı gelmezse kendiliğinden kapanır, dosya silinir", bosta[0] === "bosta" && !bs.acikMi() && !fs.existsSync(dosya));

  /* ---- isteğe bağlı mutlak oturum süresi (baslat({ sure })): çağrılar uzatmaz ---- */
  // (İlk inceleme: deneme oturumu için eklendi; köprü artık yalnız Pro, panel kullanmıyor. Mekanizma kurucu
  // deneme oturumunu geri isterse diye sunucuda ve testte kalıyor: kurucu notu MCP.9)
  var sureKapanma = [];
  var ss = S.olustur({ dosya: dosya, bostaKapanma: 250, yurut: function () { return { ok: true }; }, onKapandi: function (n) { sureKapanma.push(n); } });
  var sp = (await ss.baslat({ sure: 600 })).port, st = ss._token();
  var sBas = Date.now(), sKodlar = [];
  while (ss.acikMi() && Date.now() - sBas < 2000) { sKodlar.push((await istek(sp, { token: st })).kod); await bekle(100); }
  var sGecen = Date.now() - sBas;
  ok("süre sınırlı oturum: 100 ms'de bir çağrı boşta sayacını canlı tutsa da süre dolunca kapanır ('sure'), dosya silinir",
    sureKapanma[0] === "sure" && !ss.acikMi() && !fs.existsSync(dosya) && sGecen >= 550 && sGecen < 1500 && sKodlar.length >= 4 && sKodlar.every(function (k) { return k === 200; }), sureKapanma.join(",") + " " + sGecen + "ms " + js(sKodlar));
  r = await istek(sp, { token: st });
  ok("süre dolduktan sonra istek bağlanamaz", r.kod === 0, r.kod);
  // süre sınırı kaldırılınca (oturumda Pro alındı) yalnız boşta kapanma kalır
  sureKapanma = [];
  sp = (await ss.baslat({ sure: 300 })).port; st = ss._token();
  ss.sureSiniri(0);
  for (var sq = 0; sq < 5; sq++) { await istek(sp, { token: st }); await bekle(100); }
  ok("sureSiniri(0): sınır kalkar, çağrı geldikçe açık kalır", ss.acikMi() && sureKapanma.length === 0, sureKapanma.join(","));
  await bekle(400);
  ok("sınır kalkınca boşta kapanma yine çalışır", !ss.acikMi() && sureKapanma[0] === "bosta", sureKapanma.join(","));
  // sınırsız açılış (Pro): süre sınırı kurulmaz; yeniden açılışta eski sınır taşınmaz
  sureKapanma = [];
  var sz = S.olustur({ dosya: dosya, bostaKapanma: 0, yurut: function () { return { ok: true }; }, onKapandi: function (n) { sureKapanma.push(n); } });
  await sz.baslat({ sure: 200 });
  sz.durdur("kapat");
  await sz.baslat();
  await bekle(350);
  ok("süre sınırlı oturum kapatılıp sınırsız açılınca eski süre sınırı işlemez", sz.acikMi() && js(sureKapanma) === '["kapat"]', js(sureKapanma));
  sz.durdur();

  /* ---- Premiere meşgul: yazma eylemi bekler, zaman aşımında 503 ---- */
  var mesgul = true;
  var ms = S.olustur({ dosya: dosya, mesgulBekleme: 300, izinler: function () { return { duzenleme: true, onay: true }; },
    mesgulMu: function () { return mesgul; }, yurut: function () { return { ok: true }; } });
  var mp = (await ms.baslat()).port, mt = ms._token();
  r = await istek(mp, { token: mt, govde: JSON.stringify({ ad: "suflo_oynatma_kafasi", args: { saniye: 3 } }) });
  ok("Premiere meşgulken yazma eylemi 503 premiere_mesgul", r.kod === 503 && r.govde.hata === "premiere_mesgul", js(r.govde));
  r = await istek(mp, { token: mt });
  ok("okuma eylemi meşgulken de yanıt verir", r.kod === 200);
  setTimeout(function () { mesgul = false; }, 100);
  r = await istek(mp, { token: mt, govde: JSON.stringify({ ad: "suflo_oynatma_kafasi", args: { saniye: 3 } }) });
  ok("meşguliyet bitince yazma eylemi yürütülür", r.kod === 200 && r.govde.ok === true);
  ms.durdur();

  /* ---- kapatma anahtarı: kabul edilmiş ama yürütülmemiş istek köprü kapanınca yürütülmez ---- */
  // (inceleme bulgusu: meşgul beklemesindeki marker isteği köprü kapatıldıktan sonra yine yürütülüyordu)
  var kYurut = [], kIzin = { duzenleme: true, onay: true }, kMesgul = true;
  var ks = S.olustur({ dosya: dosya, mesgulBekleme: 5000, izinler: function () { return kIzin; },
    mesgulMu: function () { return kMesgul; }, yurut: function (ad) { kYurut.push(ad); return { ok: true }; } });
  var kp = (await ks.baslat()).port, kt = ks._token();
  bas = Date.now();
  var kSoz = istek(kp, { token: kt, govde: JSON.stringify({ ad: "suflo_marker_ekle", args: { markerlar: [{ saniye: 1 }] } }) });
  await bekle(250);
  ks.durdur("kapat");
  setTimeout(function () { kMesgul = false; }, 300);
  r = await kSoz;
  await bekle(400);
  ok("meşgul beklemesindeyken köprü kapatılırsa eylem yürütülmez, hemen 503 kopru_kapali", r.kod === 503 && r.govde.hata === "kopru_kapali" && kYurut.length === 0 && Date.now() - bas < 2000,
    r.kod + " " + js(r.govde) + " " + js(kYurut));
  // kapatılıp HEMEN yeniden açılsa da eski oturumun isteği yürütülmez (kuşak değişti)
  kMesgul = true;
  kp = (await ks.baslat()).port; kt = ks._token();
  kSoz = istek(kp, { token: kt, govde: JSON.stringify({ ad: "suflo_oynatma_kafasi", args: { saniye: 2 } }) });
  await bekle(250);
  ks.durdur("kapat");
  await ks.baslat();
  kMesgul = false;
  r = await kSoz;
  ok("kapat + yeniden aç: önceki oturumun bekleyen isteği yürütülmez", r.kod === 503 && r.govde.hata === "kopru_kapali" && kYurut.length === 0, js(r.govde) + " " + js(kYurut));
  // "Düzenlemeye izin ver" bekleme sırasında kapatılırsa: 403 izin_yok, yürütülmez
  kMesgul = true;
  kp = ks.port(); kt = ks._token();
  kSoz = istek(kp, { token: kt, govde: JSON.stringify({ ad: "suflo_marker_ekle", args: { markerlar: [{ saniye: 1 }] } }) });
  await bekle(250);
  kIzin.duzenleme = false;
  kMesgul = false;
  r = await kSoz;
  ok("bekleme sırasında düzenleme izni kapatılırsa 403 izin_yok, yürütülmez", r.kod === 403 && r.govde.hata === "izin_yok" && kYurut.length === 0, js(r.govde));
  ks.durdur();

  /* ---- kapanışta kuyruktaki istekler yanıtsız kalmaz ---- */
  var qYurut = [];
  var qs = S.olustur({ dosya: dosya, yurut: function (ad) {
    qYurut.push(ad);
    return new Promise(function (res2) { setTimeout(function () { res2({ ok: true }); }, 600); });
  } });
  var qp = (await qs.baslat()).port, qt = qs._token();
  var q1 = istek(qp, { token: qt, govde: JSON.stringify({ ad: "suflo_doktor", args: {} }) });
  await bekle(100);
  var q2 = istek(qp, { token: qt, govde: JSON.stringify({ ad: "suflo_baglam", args: {} }) });
  await bekle(150);
  bas = Date.now();
  qs.durdur("kapat");
  var r2b = await q2;
  var r1b = await q1;
  ok("kuyruktaki istek kapanışta hemen 503 kopru_kapali alır (soket açık kalmaz)", r2b.kod === 503 && r2b.govde.hata === "kopru_kapali" && Date.now() - bas < 1000 && qYurut.join(",") === "suflo_doktor",
    r2b.kod + " " + js(r2b.govde) + " " + js(qYurut));
  ok("süren eylem yarıda kesilmez, kendi yanıtını alır", r1b.kod === 200 && r1b.govde.ok === true, js(r1b.govde));

  /* ---- hata yolunda da mutlak yol sızmaz ---- */
  var hs = S.olustur({ dosya: dosya, izinler: function () { return { duzenleme: true, onay: true }; }, yurut: function () {
    return Promise.reject(new Error("EACCES: permission denied, open '/Users/samet/Projeler/Gizli Musteri/suflo-altyazi.srt'"));
  } });
  var hp = (await hs.baslat()).port;
  r = await istek(hp, { token: hs._token(), govde: JSON.stringify({ ad: "suflo_altyazi_disari", args: { bicim: "srt" } }) });
  ok("eylem istisnası: yanıtta klasör yolu yok, dosya adı kalır", r.kod === 500 && /suflo-altyazi\.srt/.test(r.govde.mesaj) && !/Gizli|Projeler|Users|samet/.test(r.govde.mesaj), js(r.govde));
  hs.durdur();
  var hs2 = S.olustur({ dosya: dosya, yurut: function () { return { ok: false, hata: "x", mesaj: "Dosya okunamadı: C:\\Users\\Samet Kaygısız\\Videos\\ham.mp4" }; } });
  hp = (await hs2.baslat()).port;
  r = await istek(hp, { token: hs2._token(), govde: JSON.stringify({ ad: "suflo_baglam", args: {} }) });
  ok("eylemin ok:false mesajında boşluklu klasör adları da düşer", r.govde.ok === false && r.govde.mesaj === "Dosya okunamadı: ham.mp4", js(r.govde));
  hs2.durdur();

  /* ---- hız sınırı jetondan sonra: jetonsuz istekler gerçek istemciyi kilitleyemez ---- */
  var rk = [];
  var rs = S.olustur({ dosya: dosya, dakikaSiniri: 5, yurut: function () { return { ok: true }; }, kayit: function (k) { rk.push(k); } });
  var rp = (await rs.baslat()).port, rt = rs._token();
  var jetonsuz = [];
  for (var u = 0; u < 15; u++) jetonsuz.push((await istek(rp, { token: "0" })).kod);
  r = await istek(rp, { token: rt });
  ok("15 jetonsuz istek 401; ardından gerçek istemci 200 (429 değil)", jetonsuz.every(function (x) { return x === 401; }) && r.kod === 200, js(jetonsuz) + " " + r.kod);

  /* ---- reddedilen istekler de etkinlik listesine yazılır (dakikada en çok 10 satır) ---- */
  var redler = rk.filter(function (k) { return k.ad === "_istek"; });
  ok("reddedilen istek etkinlikte (jeton), sel sınırlı: 15 retten 10 satır", redler.length === 10 && redler[0].kod === "jeton" && redler[0].sonuc === "hata", js(redler.slice(0, 2)) + " n=" + redler.length);
  await istek(rp, { token: rt, basliklar: { Host: "kotu.example" } });
  ok("tam sınırdan sonra yeni ret satırı eklenmez (gerçek çağrılar listeden itilmez)", rk.filter(function (k) { return k.ad === "_istek"; }).length === 10 && rk.some(function (k) { return k.ad === "suflo_baglam" && k.sonuc === "ok"; }));
  rs.durdur();

  /* ---- aynı anda tek onay kartı: ikinci yıkıcı istek 409, ilk kart değişmez ---- */
  var oKartlar = [], oCoz = null, oYurut = [];
  var os2 = S.olustur({ dosya: dosya, izinler: function () { return { duzenleme: true, onay: true }; },
    proIzin: function () { return { ok: true, deneme: false }; },
    onayIste: function (ad, args, ozet) { oKartlar.push(ad); return new Promise(function (res3) { oCoz = res3; }); },
    yurut: function (ad) { oYurut.push(ad); return { ok: true }; } });
  var op = (await os2.baslat()).port, ot = os2._token();
  var o1 = istek(op, { token: ot, govde: JSON.stringify({ ad: "suflo_sessizlik_kes", args: {} }) });
  await bekle(150);
  r = await istek(op, { token: ot, govde: JSON.stringify({ ad: "suflo_hiz_rampasi", args: {} }) });
  ok("onay beklerken ikinci yıkıcı istek 409 onay_bekliyor; kart değişmez, ilk istek reddedilmez", r.kod === 409 && r.govde.hata === "onay_bekliyor" && js(oKartlar) === '["suflo_sessizlik_kes"]', js(r.govde) + " " + js(oKartlar));
  oCoz(true);
  r = await o1;
  ok("kullanıcı ilk kartı onaylayınca ilk eylem yürütülür", r.kod === 200 && r.govde.ok === true && js(oYurut) === '["suflo_sessizlik_kes"]', js(r.govde) + " " + js(oYurut));
  var o3 = istek(op, { token: ot, govde: JSON.stringify({ ad: "suflo_hiz_rampasi", args: {} }) });
  await bekle(150);
  ok("kart yanıtlanınca yeni yıkıcı istek yeniden kart açar", js(oKartlar) === '["suflo_sessizlik_kes","suflo_hiz_rampasi"]', js(oKartlar));
  oCoz(false);
  r = await o3;
  ok("ikinci kart reddedilince 403 reddedildi, yürütülmez", r.kod === 403 && r.govde.hata === "reddedildi" && oYurut.length === 1, js(r.govde));
  os2.durdur();

  /* ---- bağlantı dosyası yalnız bu oturumun yazdığıysa silinir (inceleme bulgusu) ---- */
  // Tüm Suflo panelleri (aynı anda açık iki Premiere sürümü) aynı Kesit klasörünü paylaşır: eski kapanış, diğer
  // köprünün sonradan yazdığı dosyayı da siliyordu; o köprü "AÇIK" görünürken Claude "köprü kapalı" alıyordu
  var bA = S.olustur({ dosya: dosya, yurut: function () { return { ok: true }; } });
  var bB = S.olustur({ dosya: dosya, yurut: function () { return { ok: true }; } });
  await bA.baslat();
  var bpB = (await bB.baslat()).port, btB = bB._token();
  ok("ikinci köprü dosyayı kendi jetonuyla yazar", JSON.parse(fs.readFileSync(dosya, "utf8")).token === btB);
  bA.durdur("kapat");
  ok("ilk köprü kapanınca ikincinin dosyası SİLİNMEZ", fs.existsSync(dosya) && JSON.parse(fs.readFileSync(dosya, "utf8")).token === btB);
  r = await istek(bpB, { token: btB });
  ok("ikinci köprü çalışmaya devam eder", r.kod === 200 && r.govde.ok === true, r.kod);
  bB.jetonYenile();
  bB.durdur("kapat");
  ok("sahibi kapanınca (jeton yenilendikten sonra da) dosya silinir", !fs.existsSync(dosya));

  /* ---- sessiz / yarım soketler: okuma süresinde kapanır, uzun eylem kesilmez (inceleme bulgusu) ---- */
  // sunucu.timeout = 0 ve headersTimeout (Node 12'de yalnız yeni bayt gelince denetlenir) ile hiç bayt göndermeyen
  // soket süresiz açık kalıyordu; yüzlerce soket panelin dosya tanıtıcılarını tüketebilirdi
  var tYurut = [];
  var ts = S.olustur({ dosya: dosya, okumaSuresi: 300, yurut: function (ad) {
    tYurut.push(ad);
    return new Promise(function (res4) { setTimeout(function () { res4({ ok: true, uzun: true }); }, 900); });
  } });
  var tp = (await ts.baslat()).port;
  var sessiz = await soketAc(tp);
  var yarim = await soketAc(tp, "POST /v1/eylem HTTP/1.1\r\nHost: 127.0.0.1:" + tp + "\r\n");
  var tk = await Promise.all([kapaninca(sessiz, 4000), kapaninca(yarim, 4000)]);
  ok("hiç bayt göndermeyen ve başlığı yarım bırakan soket okuma süresi dolunca kapanır", tk[0] >= 0 && tk[0] < 2500 && tk[1] >= 0 && tk[1] < 2500, js(tk));
  bas = Date.now();
  r = await istek(tp, { token: ts._token(), govde: JSON.stringify({ ad: "suflo_doktor", args: {} }) });
  ok("jetonu doğru eylem okuma süresinden (300 ms) uzun sürse de (900 ms) yanıtını alır", r.kod === 200 && r.govde.ok === true && r.govde.sonuc.uzun === true && Date.now() - bas >= 850,
    r.kod + " " + js(r.govde));
  ts.durdur();

  // Köprüyü kapat: close() yalnız yeni bağlantıyı durdurur; istek taşımayan açık soketler de kapanmalı
  var ds = S.olustur({ dosya: dosya, yurut: function () { return { ok: true }; } });
  var dp = (await ds.baslat()).port;
  var d1 = await soketAc(dp), d2 = await soketAc(dp, "POST /v1/eylem HTTP/1.1\r\n");
  await bekle(50);
  var dk = [kapaninca(d1, 3000), kapaninca(d2, 3000)];
  ds.durdur("kapat");
  dk = await Promise.all(dk);
  ok("Köprüyü kapat: istek taşımayan açık soketler hemen kapanır (30 sn beklemez)", dk.every(function (x) { return x >= 0 && x < 1000; }), js(dk));

  /* ---- Yeni jeton yazılamazsa köprü kapanır, istisna kaçmaz (inceleme bulgusu) ---- */
  var yazHatasi = "", adHatasi = false;
  var sahteFs = {
    mkdirSync: fs.mkdirSync, chmodSync: fs.chmodSync, unlinkSync: fs.unlinkSync, readFileSync: fs.readFileSync,
    writeFileSync: function (f, d, o) {
      if (yazHatasi) { var e = new Error(yazHatasi + ": no space left on device, open '" + f + "'"); e.code = yazHatasi; throw e; }
      return fs.writeFileSync(f, d, o);
    },
    renameSync: function (a, b) {
      if (adHatasi) { var e = new Error("EPERM: operation not permitted, rename '" + a + "'"); e.code = "EPERM"; throw e; }
      return fs.renameSync(a, b);
    }
  };
  var jk = [];
  var jsS = S.olustur({ dosya: dosya, fs: sahteFs, yurut: function () { return { ok: true }; }, onKapandi: function (n) { jk.push(n); } });
  var jp = (await jsS.baslat()).port, jt = jsS._token();
  yazHatasi = "ENOSPC";
  var jr;
  try { jr = jsS.jetonYenile(); } catch (e) { jr = { firlatti: String(e && e.message) }; }
  ok("Yeni jeton yazılamazsa (dolu disk): istisna fırlatmaz, { ok:false, hata }", jr && jr.ok === false && jr.hata === "ENOSPC", js(jr));
  ok("... köprü kapanır (kimsenin bilmediği jetonla açık kalmaz), onKapandi('dosya')", !jsS.acikMi() && js(jk) === '["dosya"]', js(jk));
  ok("... eski jetonun dosyası da silinir, geçici dosya kalmaz", !fs.existsSync(dosya) && fs.readdirSync(path.dirname(dosya)).length === 0, fs.readdirSync(path.dirname(dosya)).join(","));
  r = await istek(jp, { token: jt });
  ok("... port artık dinlemiyor", r.kod === 0, r.kod);
  // Windows: hedef kilitliyken rename hep başarısız (önce eski dosya silinir, ikinci rename de düşer)
  yazHatasi = "";
  jk = [];
  await jsS.baslat();
  adHatasi = true;
  jr = jsS.jetonYenile();
  ok("rename hatası (kilitli dosya): { ok:false, EPERM }, köprü kapanır, geçici dosya kalmaz", jr.ok === false && jr.hata === "EPERM" && !jsS.acikMi() &&
    fs.readdirSync(path.dirname(dosya)).length === 0, js(jr) + " " + fs.readdirSync(path.dirname(dosya)).join(","));
  adHatasi = false;
  ok("kapalı köprüde jetonYenile { ok:false } döner", jsS.jetonYenile().ok === false);

  /* ---- onay kartı açıkken "Düzenlemeye izin ver" kapatılırsa: 403 izin_yok, yürütülmez ---- */
  var eIzin = { duzenleme: true, onay: true }, eCoz = null, eYurut = [];
  var es = S.olustur({ dosya: dosya, izinler: function () { return eIzin; }, proIzin: function () { return { ok: true, deneme: false }; },
    onayIste: function () { return new Promise(function (res5) { eCoz = res5; }); },
    yurut: function (ad) { eYurut.push(ad); return { ok: true }; } });
  var ep = (await es.baslat()).port;
  var eSoz = istek(ep, { token: es._token(), govde: JSON.stringify({ ad: "suflo_sessizlik_kes", args: {} }) });
  await bekle(150);
  eIzin.duzenleme = false;
  eCoz(false);   // panel: izin kapanınca bekleyen kart kapanır (coz(false))
  r = await eSoz;
  ok("onay beklerken düzenleme izni kapatılırsa 403 izin_yok (reddedildi değil), yürütülmez", r.kod === 403 && r.govde.hata === "izin_yok" && eYurut.length === 0, js(r.govde));
  es.durdur();

  try { fs.rmdirSync(path.join(dizin, "Kesit")); fs.rmdirSync(dizin); } catch (e) {}
  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}
main().catch(function (e) { console.log("FAIL beklenmeyen hata " + (e && e.stack)); process.exit(1); });
