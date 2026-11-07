// Suflo testi: stilli katman render'ında İptal ve deneme hakkı (parti 8).
//  1) captions.js overlayUygula (GERÇEK işlev, sahte DOM / Premiere / Pro; gerçek overlay-render.js, sahte ffmpeg):
//     render sürerken 3. adımda "İptal" (#cap-uygula-iptal) görünür, stil düğmesi kapalı; bitince ikisi eski hâline döner.
//     İptal: ffmpeg öldürülür, "İptal edildi", yarım dosya ve geçici klasör yok, KS_placeOverlay yok, Pro.denemeHarca YOK.
//     ffmpeg hatası: anlaşılır metin (hataMetni), denemeHarca YOK. Başarı: yerleştirme SONRASI tek hak.
//     Render sürerken ikinci tık ikinci render başlatmaz.
//  2) Shorts paketi (shorts-paket-plan.js runJob): katman adımında iptal → adım "bekliyor" kalır (hata değil), iş "iptal";
//     "Devam et" (resumeJob) o adımdan sürer.
var fs = require("fs"), os = require("os"), path = require("path");
var KOK = path.join(__dirname, "..");
var OR = require(path.join(KOK, "js", "overlay-render.js"));
var P = require(path.join(KOK, "js", "shorts-paket-plan.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
function govde(imza) { var i = cap.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return cap.slice(i, cap.indexOf("\n  }\n", i) + 4); }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }

var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-katman-iptal-"));

function ortam(o) {
  o = o || {};
  var tmp = fs.mkdtempSync(path.join(kok, "tmp-")), srt = fs.mkdtempSync(path.join(kok, "srt-"));
  var kayit = { durum: [], harca: [], cagri: [], toast: [], ipucu: 0, run: [], gozlem: [] };
  function dugum(id, ek) { var d = { id: id, hidden: false, disabled: false, textContent: "", _o: {} }; d.addEventListener = function (t, f) { d._o[t] = f; }; for (var k in ek || {}) d[k] = ek[k]; return d; }
  var dom = { "cap-uygula-iptal": dugum("cap-uygula-iptal", { hidden: true }), "cap-apply-style": dugum("cap-apply-style"), "cap-emoji-atla": dugum("cap-emoji-atla", { hidden: true }),
    "cap-uygula-durum": dugum("cap-uygula-durum", { className: "inline-status" }) };
  var K = {
    fs: fs, path: path, log: function () {}, tmpDir: function () { return tmp; }, srtDir: function () { return srt; },
    extensionPath: function () { return KOK; }, findFfmpeg: function () { return Promise.resolve("ffmpeg"); },
    iptalJetonu: function () { return OR.yerelJeton(); },
    iptalHatasi: function (m) { var e = new Error(m || "İptal edildi"); e.iptal = true; return e; },
    hataYardimi: function (e) { return e && e.message ? e.message : String(e); },
    run: function (exe, args, opt) {
      var c = { args: args, cwd: opt.cwd, olduruldu: false };
      kayit.run.push(c);
      // render sürerken düğmelerin hâli
      kayit.gozlem.push({ iptalGorunur: dom["cap-uygula-iptal"].hidden === false, stilKapali: dom["cap-apply-style"].disabled === true });
      return new Promise(function (res) {
        var bitti = false;
        function kapat(x) { if (!bitti) { bitti = true; res(x); } }
        // ffmpeg yarım dosya yazmış olsun: iptalde silinmeli
        fs.writeFileSync(args[args.length - 1], "yarim");
        if (opt.iptal) opt.iptal.dinle(function () { c.olduruldu = true; kapat({ code: -2, iptal: true, stdout: "", stderr: "" }); });
        c.bitir = function (r) { kapat(r || { code: 0, stdout: "progress=end\n", stderr: "" }); };
        if (opt.onStdout) opt.onStdout("out_time_us=1000000\nprogress=continue\n");
      });
    },
    call: function (fn, arg) {
      kayit.cagri.push(fn);
      if (fn === "KS_overlaySpec") {
        var spec = { ok: true, width: 1280, height: 720, fps: 25, end: 10, inPoint: 0, outPoint: 0 };
        // o.specBekle: Premiere yanıtı gecikir (çift tık bu arada gelir); kayit.specVer() ile çözülür
        if (o.specBekle) return new Promise(function (r) { kayit.specVer = function () { r(spec); }; });
        return Promise.resolve(spec);
      }
      if (fn === "KS_placeOverlay") return Promise.resolve({ ok: true, trackName: "V3", start: 0 });
      if (fn === "KS_getContext") return Promise.resolve({ ok: true, sequenceId: "s1", sequence: "Sekans" });
      return Promise.resolve({ ok: false });
    }
  };
  var Pro = {
    gate: function () { return true; }, isPro: function () { return !!o.pro; },
    filigranGerekli: function () { return !o.pro; },
    denemeHarca: function (f) { kayit.harca.push(f); return 2; },
    denemeCiktisiEkle: function () { return true; }
  };
  var win = {
    SufloOverlayRender: OR,
    SufloFiligran: require(path.join(KOK, "js", "filigran.js")),
    SufloStyleEngine: { compile: function () { return { id: "efekt", ass: "[Script Info]\nPlayResX: 1280\n[Events]\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Merhaba\n", fontFiles: [] }; } }
  };
  var kod = [
    "var EFEKT = 'efekt', segments = [{ start: 0, end: 1, text: 'Merhaba' }], secilenMogrt = null, emojiAtlaBirKez = false, emojisizCikti = false, katmanKareHizi = 0, scope = 'entire', FONTLAR = {};",
    "function status(m, c) { kayit.durum.push([m, c || '']); } function uygulaEtiketiniSifirla() {} function emojiAtlaDugmesi() {} function emojiIceriyorMu() { return false; }",
    "function yerelCiktiSecili() { return false; } function mogrtStiliniUygula() {} function yerelAltyaziUygula() { return false; }",
    "function cueler() { return [{ start: 0, end: 1, text: 'Merhaba' }]; } function stil() { return { aile: 'efekt', yogunluk: 'balanced' }; }",
    "function motorStiliMi() { return true; } function markaKiti() { return null; } function konusmaciRenkleri(x) { return x; } function motorCueTuru() { return 'lines'; }",
    "function motorAyarlari() { return {}; } function kirilimDili() { return 'tr'; } function buildAssKaydirilmis() { return ''; } function uzantiDizini() { return KOK; }",
    "function yildizIste() {} function uygulamaIpucunuGuncelle() { kayit.ipucu++; el('cap-apply-style').disabled = !!(katmanIptal || katmanHazirlaniyor); }",
    "var CT = { logoKatmanKalan: function () { return 0; }, katmanSuresi: function () { return 3; } };",
    cap.slice(cap.indexOf("  var katmanIptal = null;"), cap.indexOf("  function uygulaEtiketiniSifirla(")),
    govde("async function overlayUygula("), govde("function katmanCueleri("),
    "return { overlayUygula: overlayUygula, iptalEt: katmanIptalEt, calisiyor: function () { return !!katmanIptal; } };"
  ].join("\n");
  var api = new Function("K", "KApp", "Pro", "window", "el", "kayit", "KOK", kod)(K,
    { toast: function (m, t) { kayit.toast.push([m, t]); } }, Pro, win, function (id) { return dom[id] || null; }, kayit, KOK);
  return { api: api, dom: dom, kayit: kayit, tmp: tmp, srt: srt };
}
function cikti(e) { var a = e.kayit.run[0].args; return a[a.length - 1]; }

(async function () {
  ok("index.html: 3. adımda #cap-uygula-iptal (iptal-btn, başta gizli) ve init'te bağlı",
    /<button type="button" id="cap-uygula-iptal" class="btn outline big iptal-btn" hidden title="[^"]+">İptal<\/button>/.test(html) &&
    html.indexOf('id="cap-uygula-iptal"') > html.indexOf('id="cap-adim-uygula"') &&
    /el\("cap-uygula-iptal"\)\.addEventListener\("click", katmanIptalEt\)/.test(cap));

  // 1) başarı (deneme hakkıyla, filigranlı)
  var a = ortam();
  var pa = a.api.overlayUygula();
  await bekle(20);
  ok("render sürerken İptal görünür ve stil düğmesi kapalı", a.kayit.gozlem.length === 1 && a.kayit.gozlem[0].iptalGorunur && a.kayit.gozlem[0].stilKapali,
    JSON.stringify(a.kayit.gozlem));
  ok("render sürerken ilerleme durum satırında (%)", a.kayit.durum.some(function (d) { return /^Altyazı katmanı çiziliyor · %\d+/.test(d[0]); }), JSON.stringify(a.kayit.durum));
  ok("ilerleme 3. adımda da: #cap-uygula-durum (İptal'in altında)", /^Altyazı katmanı çiziliyor · %\d+/.test(a.dom["cap-uygula-durum"].textContent), a.dom["cap-uygula-durum"].textContent);
  var ikinci = a.api.overlayUygula();
  await ikinci;
  ok("render sürerken ikinci tık ikinci render başlatmaz", a.kayit.run.length === 1 && /zaten hazırlanıyor/.test(a.kayit.durum[a.kayit.durum.length - 1][0]));
  a.kayit.run[0].bitir();
  await pa;
  ok("başarı: İptal gizlenir, stil düğmesi eski hâline döner", a.dom["cap-uygula-iptal"].hidden === true && a.dom["cap-apply-style"].disabled === false &&
    a.kayit.ipucu >= 1 && a.api.calisiyor() === false);
  ok("başarı: 3. adımdaki durum satırı temizlenir", a.dom["cap-uygula-durum"].textContent === "", a.dom["cap-uygula-durum"].textContent);
  ok("başarı: yerleştirme SONRASI tek deneme hakkı", a.kayit.cagri.indexOf("KS_placeOverlay") !== -1 && a.kayit.harca.join() === "overlay", JSON.stringify(a.kayit));

  // 2) iptal
  var b = ortam();
  var pb = b.api.overlayUygula();
  await bekle(20);
  b.api.iptalEt({ detail: 1 });   // düğme göründükten hemen sonra: çift tık koruması K.iptalTikiGecerli yoksa yok
  await pb;
  var sonB = b.kayit.durum[b.kayit.durum.length - 1];
  ok("iptal: ffmpeg öldürüldü, 'İptal edildi' uyarısı", b.kayit.run[0].olduruldu === true && sonB[0] === "İptal edildi" && sonB[1] === "warn", JSON.stringify(sonB));
  ok("iptal: timeline'a dokunulmaz, deneme hakkı DÜŞMEZ", b.kayit.cagri.indexOf("KS_placeOverlay") === -1 && b.kayit.harca.length === 0, JSON.stringify(b.kayit.cagri));
  ok("iptal: yarım çıktı ve geçici klasör silindi", !fs.existsSync(cikti(b)) && fs.readdirSync(b.tmp).length === 0 && fs.readdirSync(b.srt).length === 0,
    fs.readdirSync(b.tmp).concat(fs.readdirSync(b.srt)).join(","));
  ok("iptal: 3. adımdaki satır 'İptal edildi' (uyarı) ve uyarı bildirimi", b.dom["cap-uygula-durum"].textContent === "İptal edildi" &&
    /\bwarn\b/.test(b.dom["cap-uygula-durum"].className) && b.kayit.toast.some(function (t) { return t[1] === "warn"; }), JSON.stringify([b.dom["cap-uygula-durum"], b.kayit.toast]));
  ok("iptal: düğmeler eski hâline döner", b.dom["cap-uygula-iptal"].hidden === true && b.dom["cap-apply-style"].disabled === false && b.api.calisiyor() === false);

  // 3) ffmpeg hatası: anlaşılır metin, hak düşmez
  var c = ortam();
  var pc = c.api.overlayUygula();
  await bekle(20);
  c.kayit.run[0].bitir({ code: 1, stdout: "", stderr: "[AVFilterGraph @ 0x5] No such filter: 'subtitles'\nError initializing complex filters.\n" });
  await pc;
  var sonC = c.kayit.durum[c.kayit.durum.length - 1];
  ok("hata: hataMetni (altyazı filtresi yok → Suflo ffmpeg'ini kur), kırmızı", /ffmpeg'in altyazı filtresi yok: Ayarlar › ffmpeg'den Suflo ffmpeg'ini kur/.test(sonC[0]) && sonC[1] === "bad", sonC[0]);
  ok("hata: deneme hakkı DÜŞMEZ, yerleştirme yok, yarım dosya silindi", c.kayit.harca.length === 0 && c.kayit.cagri.indexOf("KS_placeOverlay") === -1 && !fs.existsSync(cikti(c)));
  ok("hata: düğmeler eski hâline döner", c.dom["cap-uygula-iptal"].hidden === true && c.api.calisiyor() === false);
  ok("hata: 3. adımdaki satırda (#cap-uygula-durum, kırmızı) ve kırmızı bildirimde de görünür",
    c.dom["cap-uygula-durum"].textContent === sonC[0] && /\bbad\b/.test(c.dom["cap-uygula-durum"].className) &&
    c.kayit.toast.some(function (t) { return t[0] === sonC[0] && t[1] === "bad"; }), JSON.stringify([c.dom["cap-uygula-durum"], c.kayit.toast]));

  // 3b) çift tık render başlamadan (KS_overlaySpec yanıtı gelmeden): tek iş, İptal onu durdurur, hiçbir katman konmaz
  var cc = ortam({ specBekle: true });
  var p1 = cc.api.overlayUygula();
  ok("çift tık: ilk tıktan hemen sonra stil düğmesi kapalı (Premiere yanıtı beklenirken)", cc.dom["cap-apply-style"].disabled === true);
  var p2 = cc.api.overlayUygula();
  await p2;
  ok("çift tık: ikinci tık 'zaten hazırlanıyor' der, ikinci KS_overlaySpec yok", cc.kayit.cagri.filter(function (x) { return x === "KS_overlaySpec"; }).length === 1 &&
    /zaten hazırlanıyor/.test(cc.kayit.durum[cc.kayit.durum.length - 1][0]), JSON.stringify([cc.kayit.cagri, cc.kayit.durum]));
  cc.kayit.specVer();
  await bekle(20);
  ok("çift tık: tek ffmpeg çizimi", cc.kayit.run.length === 1, cc.kayit.run.length);
  cc.api.iptalEt({ detail: 1 });
  await p1;
  await bekle(20);
  ok("çift tık + İptal: çizim öldürüldü, katman konmaz, hak düşmez", cc.kayit.run.length === 1 && cc.kayit.run[0].olduruldu === true &&
    cc.kayit.cagri.indexOf("KS_placeOverlay") === -1 && cc.kayit.harca.length === 0, JSON.stringify([cc.kayit.cagri, cc.kayit.harca]));
  ok("çift tık + İptal: düğmeler eski hâline döner", cc.dom["cap-apply-style"].disabled === false && cc.dom["cap-uygula-iptal"].hidden === true);

  // 4) render bittiği anda basılan İptal: yerleştirme yine yapılmaz
  var d = ortam();
  var pd = d.api.overlayUygula();
  await bekle(20);
  d.kayit.run[0].bitir();
  d.api.iptalEt({ detail: 1 });   // render çözüldü ama overlayUygula henüz devam etmedi
  await pd;
  ok("bitiş anında iptal: katman konmaz, hak düşmez, dosya silinir", d.kayit.cagri.indexOf("KS_placeOverlay") === -1 && d.kayit.harca.length === 0 &&
    !fs.existsSync(cikti(d)) && d.kayit.durum[d.kayit.durum.length - 1][0] === "İptal edildi", JSON.stringify(d.kayit.durum.slice(-2)));

  // 5) Shorts paketi: katman adımında iptal
  var adimlar = {};
  P.ADIMLAR.forEach(function (x) { adimlar[x] = "atlandi"; });
  adimlar.sekans = "tamam"; adimlar.altyazi = "bekliyor";
  var job = P.newJob({ plan: { kisalar: [{ no: 1, ad: "A", start: 0, end: 30, adimlar: adimlar, hatalar: {}, notlar: {}, seqId: "q1" }] } });
  {
    var k = job.kisalar[0];
    var cagrildi = 0;
    var deps = {
      activate: function () { return Promise.resolve({ ok: true, id: "q1", width: 1080, height: 1920, end: 30, fps: 30, paket: [] }); },
      altyazi: function () { cagrildi++; var e = new Error("İptal edildi"); e.iptal = true; return Promise.reject(e); },
      kaydet: function () {}, iptalMi: function () { return false; }
    };
    await P.runJob(job, deps);
    ok("Shorts: iptal edilen katman adımı 'bekliyor' kalır (hata değil), iş 'iptal'", job.durum === "iptal" && k.adimlar.altyazi === "bekliyor" && !k.hatalar.altyazi && cagrildi === 1,
      JSON.stringify([job.durum, k.adimlar, k.hatalar]));
    P.resumeJob(job);
    deps.altyazi = function () { cagrildi++; return Promise.resolve({ ok: true }); };
    await P.runJob(job, deps);
    ok("Shorts: 'Devam et' aynı adımdan sürer ve biter", k.adimlar.altyazi === "tamam" && cagrildi === 2 && job.durum === "bitti", JSON.stringify([job.durum, k.adimlar]));
    var job2 = JSON.parse(JSON.stringify(job));
    job2.kisalar[0].adimlar.altyazi = "bekliyor";
    await P.runJob(job2, { activate: deps.activate, altyazi: function () { return Promise.resolve({ ok: false, iptal: true }); }, kaydet: function () {} });
    ok("Shorts: { iptal: true } dönen adım da (kanca, sessiz) aynı", job2.durum === "iptal" && job2.kisalar[0].adimlar.altyazi === "bekliyor", JSON.stringify(job2.kisalar[0].adimlar));
  }

  try { fs.rmSync(kok, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack)); process.exit(1); });
