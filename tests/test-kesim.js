/*
 * Kesim modülü ffmpeg'in GERÇEK çıktısını okuyabiliyor mu?
 *
 * magiccut.js'in parseSilence'ı kaynaktan kesilip, gerçek ffmpeg'in
 * silencedetect çıktısına karşı çalıştırılır: sentetik "konuşma-sessizlik-
 * konuşma" wav'ı üretilir, sessiz aralık ±150 ms içinde bulunmalı.
 * ffmpeg log biçimi sürümle değişirse burada patlar — üründe değil.
 *
 * Kullanım: node tests/test-kesim.js [ffmpeg-yolu]
 */
var fs = require("fs");
var os = require("os");
var pathm = require("path");
var cp = require("child_process");

var KOK = pathm.join(__dirname, "..");
var FF = process.argv[2] || "ffmpeg";
var TMP = pathm.join(os.tmpdir(), "suflo-kesim-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 90) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

/* ---------------- parseSilence'ı gerçek kaynaktan kes ---------------- */

var src = fs.readFileSync(pathm.join(KOK, "js", "magiccut.js"), "utf8");
var i0 = src.indexOf("function parseSilence(");
var i1 = src.indexOf("\n  }", i0);
if (i0 === -1 || i1 === -1) { console.log("FAIL parseSilence kaynakta bulunamadi"); process.exit(1); }
var parseSilence = new Function("stderr", src.slice(i0, i1 + 4) + "\nreturn parseSilence(stderr);");

// filtre parametreleri üründekiyle aynı kalıpta mı? (arayüz değişirse yakala)
ok("silencedetect filtresi urunde bekleneni kuruyor",
  /silencedetect=noise=.*dB:d=/.test(src), "noise=..dB:d=..");

/* ================= 1) Sabit metinle birim test ================= */

var ornek = [
  "[silencedetect @ 0x1] silence_start: 1.02367",
  "baska bir satir",
  "[silencedetect @ 0x1] silence_end: 2.51733 | silence_duration: 1.49366"
].join("\n");
var r = parseSilence(ornek);
ok("tek aralik cozuluyor", r.length === 1 && Math.abs(r[0].start - 1.02367) < 1e-4 &&
  Math.abs(r[0].end - 2.51733) < 1e-4, JSON.stringify(r));
ok("negatif start 0'a kirpiliyor",
  parseSilence("silence_start: -0.01\nsilence_end: 1.0")[0].start === 0);
ok("end'siz start yutulmuyor ama aralik uretmiyor",
  parseSilence("silence_start: 3.0").length === 0);
ok("bos girdi bos liste", parseSilence("").length === 0);

/* ================= 2) Gerçek ffmpeg ile uçtan uca ================= */

// 1 sn 440 Hz ton + 1.5 sn sessizlik + 1 sn ton
var wav = pathm.join(TMP, "konusma.wav");
var uret = cp.spawnSync(FF, [
  "-hide_banner", "-y",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
  "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=1.5",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
  "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
  "-map", "[a]", wav
], { encoding: "utf8", timeout: 60000 });

if (uret.status !== 0 || !fs.existsSync(wav)) {
  console.log("SKIP gercek-ffmpeg testleri (ffmpeg yok ya da uretim basarisiz: " +
    String(uret.stderr).slice(-200) + ")");
} else {
  // üründeki filtreyle birebir aynı çağrı biçimi
  var analiz = cp.spawnSync(FF, [
    "-hide_banner", "-i", wav,
    "-af", "silencedetect=noise=-30dB:d=0.8",
    "-f", "null", "-"
  ], { encoding: "utf8", timeout: 60000 });

  var stderr = analiz.stderr || "";
  ok("ffmpeg silencedetect calisti", analiz.status === 0, "exit " + analiz.status);
  ok("ciktida silence_start var", stderr.indexOf("silence_start") !== -1);

  var gercek = parseSilence(stderr);
  ok("gercek ciktidan 1 sessiz aralik", gercek.length === 1, JSON.stringify(gercek));
  if (gercek.length === 1) {
    ok("sessizlik baslangici ~1.0 sn (+-150 ms)", Math.abs(gercek[0].start - 1.0) < 0.15,
      gercek[0].start.toFixed(3));
    ok("sessizlik bitisi ~2.5 sn (+-150 ms)", Math.abs(gercek[0].end - 2.5) < 0.15,
      gercek[0].end.toFixed(3));
  }

  // ürünün pad/kirpma mantığının önkoşulu: aralıklar sıralı ve pozitif
  ok("araliklar sirali ve pozitif", gercek.every(function (a) { return a.end > a.start && a.start >= 0; }));
}

/* ================= 3) 3.4 canlı eşik: tek çözümleme ↔ silencedetect ================= */

var S = require(pathm.join(KOK, "js", "sessizlik.js"));
var kabi = require("./_kesim-kabi.js");

function cozumle(K, dosya, inPoint, dur) {
  var st = S.tepeZarfi(), kanal = 0, stderr = "", bekleyen = [];
  return K.runAkis(FF, S.cozumlemeArgs(dosya, inPoint, dur), {
    timeout: 60000,
    onStderr: function (s) {
      if (kanal) return;
      stderr += s; kanal = S.kanalSayisi(stderr);
      if (kanal) { bekleyen.forEach(function (b) { S.zarfBesle(st, b, { kanal: kanal }); }); bekleyen = []; }
    },
    onData: function (b) { if (kanal) S.zarfBesle(st, b, { kanal: kanal }); else bekleyen.push(b); }
  }).then(function (res) {
    if (!kanal) { kanal = S.kanalSayisi(res.stderr); bekleyen.forEach(function (b) { S.zarfBesle(st, b, { kanal: kanal }); }); }
    return { res: res, kanal: kanal, zarf: S.zarfBitir(st) };
  });
}
function silencedetect(dosya, esik, d, inPoint, dur) {
  var a = ["-hide_banner"];
  if (dur) a.push("-ss", String(inPoint), "-t", String(dur));
  a.push("-i", dosya, "-map", "0:a:0?", "-af", "silencedetect=noise=" + esik + "dB:d=" + d, "-f", "null", "-");
  return parseSilence(cp.spawnSync(FF, a, { encoding: "utf8", timeout: 60000 }).stderr || "");
}
function yakinListe(a, b, tol) {
  return a.length === b.length && a.every(function (x, i) { return Math.abs(x.start - b[i].start) <= tol && Math.abs(x.end - b[i].end) <= tol; });
}
function yaz(l) { return JSON.stringify(l.map(function (x) { return [+x.start.toFixed(3), +x.end.toFixed(3)]; })); }

async function canliTestler() {
  if (uret.status !== 0) { console.log("SKIP canli esik testleri (ffmpeg yok)"); return; }
  var K = kabi.kopruYukle();
  ok("K.runAkis köprüde dışa açık", typeof K.runAkis === "function");

  // ikili güvenlik: geçersiz UTF-8 baytları (0xff 0xfe 0xc3) olduğu gibi gelir (K.run'da U+FFFD olurdu)
  var parcalar = [];
  var r0 = await K.runAkis(process.execPath, ["-e", "process.stdout.write(Buffer.from([0xff,0xfe,0xc3,0x00,0x80]))"], {
    onData: function (b) { parcalar.push(b); }
  });
  var tum = Buffer.concat(parcalar);
  ok("runAkis: stdout ham Buffer, baytlar bozulmaz", r0.code === 0 && Buffer.isBuffer(parcalar[0]) && tum.equals(Buffer.from([0xff, 0xfe, 0xc3, 0x00, 0x80])) && r0.bayt === 5, tum.toString("hex"));
  var j = K.iptalJetonu();
  var uzun = K.runAkis(process.execPath, ["-e", "setInterval(function(){process.stdout.write('x')},5)"], { iptal: j, onData: function () {} });
  setTimeout(function () { j.iptal(); }, 60);
  var r1 = await uzun;
  ok("runAkis: iptal { code: -2, iptal: true }", r1.code === -2 && r1.iptal === true && K.surecSayisi() === 0, JSON.stringify(r1).slice(0, 80));
  var r2 = await K.runAkis(process.execPath, ["-e", "process.stdout.write('abc')"], { onData: function () { throw new Error("bozuk"); } });
  ok("runAkis: onData fırlatırsa süreç durur, { code: -1, hata }", r2.code === -1 && /bozuk/.test(r2.hata));

  // Stereo, 44.1 kHz: sol kanalda konuşma benzeri tonlar, sağ kanal hep sessiz
  var stereo = pathm.join(TMP, "stereo.wav");
  var u2 = cp.spawnSync(FF, ["-hide_banner", "-y",
    "-f", "lavfi", "-i", "sine=frequency=300:duration=1.2:sample_rate=44100",
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=1.4",
    "-f", "lavfi", "-i", "sine=frequency=500:duration=0.6:sample_rate=44100",
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=0.9",
    "-f", "lavfi", "-i", "sine=frequency=700:duration=1.0:sample_rate=44100",
    "-filter_complex", "[0:a][1:a][2:a][3:a][4:a]concat=n=5:v=0:a=1[l];anullsrc=r=44100:cl=mono:d=5.1[r];[l][r]amerge=inputs=2[a]",
    "-map", "[a]", "-ac", "2", stereo], { encoding: "utf8", timeout: 60000 });
  if (u2.status !== 0) { ok("stereo wav uretildi", false, String(u2.stderr).slice(-200)); return; }

  var c = await cozumle(K, stereo, 0, 5.1);
  ok("tek çözümleme: kod 0, 2 kanal okundu, ~510 pencere (16 kHz, 10 ms)", c.res.code === 0 && c.kanal === 2 && Math.abs(c.zarf.length - 510) <= 2, c.kanal + " kanal, " + c.zarf.length);
  ok("tek çözümleme: sağ kanal sessizken konuşma tepesi ≈ -18 dBFS (aşağı karışımla -24'e düşmezdi)", c.zarf[50] > -19 && c.zarf[50] < -17, c.zarf[50]);

  [[-30, 0.5], [-45, 0.8], [-25, 0.3]].forEach(function (p) {
    var zarfAralik = S.sessizAraliklar(c.zarf, { esik: p[0], minSessizlik: p[1], sure: 5.1 });
    var sd = silencedetect(stereo, p[0], p[1]);
    // silencedetect dosya sonundaki sessizliği kapatmayabilir: yalnız onun bulduklarını karşılaştır
    ok("bul() eşik " + p[0] + " dB, d=" + p[1] + ": silencedetect ile ±50 ms", sd.length > 0 && yakinListe(zarfAralik.slice(0, sd.length), sd, 0.05), yaz(zarfAralik) + " vs " + yaz(sd));
  });

  // -ss / -t: klip kaynağın ortasından başlıyor
  var cz = await cozumle(K, stereo, 1.0, 3.5);
  var zKes = S.sessizAraliklar(cz.zarf, { esik: -30, minSessizlik: 0.5, sure: 3.5 });
  var sdKes = silencedetect(stereo, -30, 0.5, 1.0, 3.5);
  ok("in/out penceresi (-ss 1 -t 3.5): zarf ile silencedetect ±50 ms", sdKes.length > 0 && yakinListe(zKes.slice(0, sdKes.length), sdKes, 0.05), yaz(zKes) + " vs " + yaz(sdKes));

  /* ---- Panel uçtan uca: analiz zarfla, kaydırıcı canlı, Uygula silencedetect onayıyla ---- */
  var klip = { mediaPath: stereo, inPoint: 0, outPoint: 5.1, clipStart: 10, clipEnd: 15.1 };
  var p = kabi.kesimPaneli({ K: K, ffmpeg: FF, clip: klip });
  await p.tikla("cut-analyze");
  ok("analiz: tek ffmpeg çözümlemesi (runAkis), silencedetect çalışmadı", p.kayit.runAkis.length === 1 && p.kayit.run.length === 0, p.kayit.runAkis.length + "/" + p.kayit.run.length);
  ok("analiz: sonuç ve dalga görünür, 2 kesim önerisi", !p.el("cut-result").hidden && !p.el("cut-wave").hidden && /^2 kesim/.test(p.el("cut-summary").textContent), p.el("cut-summary").textContent);
  ok("analiz: deneme hakkı düşmedi (kapı denendi, harcama yok)", p.kayit.harca.length === 0 && p.kayit.gate.length === 1 && p.kayit.gate[0][0] === "cut");

  p.kaydir("cut-minsil", "1.2");
  await p.bekle(160);
  ok("kaydırıcı (min. sessizlik 1.2): harita ffmpeg'siz güncellendi → 1 kesim", /^1 kesim/.test(p.el("cut-summary").textContent) && p.kayit.runAkis.length === 1 && p.kayit.run.length === 0, p.el("cut-summary").textContent);
  p.kaydir("cut-minsil", "0.5");
  p.kaydir("cut-minkeep", "0.6");
  await p.bekle(160);
  ok("Min. konuşma 0.6: ada TAMPONDAN SONRA ölçülür (0.6 + 2×0.15 = 0.9 ≥ 0.6) → birleşmez", /^2 kesim/.test(p.el("cut-summary").textContent), p.el("cut-summary").textContent);
  p.kaydir("cut-pad", "0");
  await p.bekle(160);
  ok("Tampon 0 + Min. konuşma 0.6: ada 0.6 sn ≥ 0.6 → yine ayrı (sınır)", /^2 kesim/.test(p.el("cut-summary").textContent), p.el("cut-summary").textContent);
  p.kaydir("cut-minkeep", "0.65");
  await p.bekle(160);
  ok("Min. konuşma 0.65: kesimler birleşti, 'birleşik' sayılır, ffmpeg yine yok", /^1 kesim/.test(p.el("cut-summary").textContent) && /1 birleşik/.test(p.el("cut-summary").textContent) && p.kayit.run.length === 0, p.el("cut-summary").textContent);
  var tarali = p.el("cut-bar").children.filter(function (s) { return / ada/.test(s.className); });
  ok("birleşik kesimin içindeki konuşma adası çubukta taralı parça, ipucu söylüyor", tarali.length === 1 && /Min\. konuşma/.test(tarali[0].title), tarali.map(function (s) { return s.className + " " + s.title; }).join(" | "));
  p.kaydir("cut-minkeep", "0");
  p.kaydir("cut-pad", "0.15");
  await p.bekle(160);

  // ikinci kesimi kullanıcı kapatır; sonra eşik değişir → karar taşınır
  var kesimler = p.el("cut-bar").children.filter(function (s) { return /\bcut\b/.test(s.className); });
  kesimler[1].onclick();
  p.kaydir("cut-noise", "-40");
  await p.bekle(160);
  var kesimler2 = p.el("cut-bar").children.filter(function (s) { return /\bcut\b/.test(s.className); });
  ok("eşik değişince kapatılan aralık kapalı kalır (kararEsle)", kesimler2.length === 2 && / off/.test(kesimler2[1].className) && !/ off/.test(kesimler2[0].className), kesimler2.map(function (s) { return s.className; }).join(","));

  await p.tikla("cut-apply");
  ok("Uygula: silencedetect son ayarlarla bir kez koştu (-40 dB, d=0.5)", p.kayit.run.length === 1 && p.kayit.run[0].join(" ").indexOf("silencedetect=noise=-40dB:d=0.5") !== -1, (p.kayit.run[0] || []).join(" "));
  var cagri = p.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; });
  var beklenen = S.kesimlereCevir(silencedetect(stereo, -40, 0.5, 0, 5.1), { pay: 0.15, sure: 5.1 }).kesimler;
  ok("Uygula: KS_applyCuts silencedetect doğrulamasının kesimlerini alır, kapatılan aralık hariç",
    cagri.length === 1 && cagri[0].payload.ranges.length === 1 && Math.abs(cagri[0].payload.ranges[0].start - (10 + beklenen[0].start)) < 1e-6 &&
    Math.abs(cagri[0].payload.ranges[0].end - (10 + beklenen[0].end)) < 1e-6 && cagri[0].payload.cloneFirst === true,
    JSON.stringify(cagri.length && cagri[0].payload) + " beklenen " + yaz(beklenen));
  ok("Uygula: deneme hakkı yalnız burada, bir kez düştü", p.kayit.harca.length === 1 && p.kayit.harca[0] === "cut");

  // Uygula'dan sonra canlı analiz de bayat: kaydırıcı Uygula'dan önceki zarftan harita kurmaz, Uygula açılmaz
  ok("Uygula sonrası: sonuç gizli, Kesimleri uygula kapalı", p.el("cut-result").hidden === true && p.el("cut-apply").disabled === true);
  var ozetOnce = p.el("cut-summary").textContent;
  p.kaydir("cut-pad", "0.1");
  await p.bekle(160);
  ok("Uygula sonrası kaydırıcı: harita yeniden kurulmaz, Uygula kapalı kalır",
    p.el("cut-result").hidden === true && p.el("cut-apply").disabled === true && p.el("cut-summary").textContent === ozetOnce &&
    /^0 kesim/.test(ozetOnce) && p.el("cut-bar").children.length === 0 && p.kayit.runAkis.length === 1, p.el("cut-summary").textContent);
  p.tikla("cut-noise-auto");
  ok("Uygula sonrası Otomatik: önce yeni analiz ister", /Önce Sessizlikleri bul/.test(p.el("cut-status").textContent), p.el("cut-status").textContent);
  await p.tikla("cut-apply");
  ok("Uygula sonrası ikinci Uygula: KS_applyCuts yeniden çağrılmaz, ffmpeg koşmaz",
    p.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; }).length === 1 && p.kayit.run.length === 1);
  p.kaydir("cut-pad", "0.15");
  await p.bekle(160);

  // Uygula'dan sonra önbellek boş: yeniden analiz yeniden çözer
  // (setBusy(false)'tan sonraki 500 ms içindeki tık çift tık koruması gereği yok sayılır: bekle)
  await p.bekle(560);
  await p.tikla("cut-analyze");
  ok("Uygula sonrası yeniden analiz: önbellek geçersiz, ffmpeg yeniden çözümler", p.kayit.runAkis.length === 2, p.kayit.runAkis.length);
  await p.bekle(560);
  await p.tikla("cut-analyze");
  ok("aynı klipte ikinci analiz: bellek önbelleğinden, ffmpeg çalışmaz", p.kayit.runAkis.length === 2, p.kayit.runAkis.length);
  p.ctx({ mediaPath: stereo, inPoint: 0, outPoint: 4, clipStart: 30, clipEnd: 34 });
  ok("klip değişince sonuç gizlenir", p.el("cut-result").hidden === true);
  p.ctx(klip);
  await p.bekle(560);
  await p.tikla("cut-analyze");
  ok("klip değişiminden sonra önbellek geçersiz: yeniden çözümler", p.kayit.runAkis.length === 3, p.kayit.runAkis.length);

  // Otomatik eşik
  p.tikla("cut-noise-auto");
  var oneri = S.esikOner(c.zarf);
  ok("Otomatik: eşik kaydırıcısı esikOner ile dolar, durum satırı açıklar", p.el("cut-noise").value === String(oneri.esik) && p.el("cut-noise-val").textContent === oneri.esik + " dB" && /eşik|fark/.test(p.el("cut-status").textContent), p.el("cut-noise").value + " " + p.el("cut-status").textContent);

  // Çözümleme yoksa (runAkis yok) eski silencedetect akışı aynen çalışır
  var p2 = kabi.kesimPaneli({ K: K, ffmpeg: FF, clip: klip, runAkisYok: true });
  await p2.tikla("cut-analyze");
  ok("yedek akış: silencedetect ile 2 kesim, dalga gizli", p2.kayit.run.length === 1 && /^2 kesim/.test(p2.el("cut-summary").textContent) && p2.el("cut-wave").hidden, p2.el("cut-summary").textContent);
  p2.kaydir("cut-minkeep", "0.65"); p2.kaydir("cut-pad", "0");
  await p2.bekle(160);
  ok("yedek akış: Tampon / Min. konuşma yine canlı (ham aralıklardan)", /^1 kesim/.test(p2.el("cut-summary").textContent) && p2.kayit.run.length === 1, p2.el("cut-summary").textContent);
  p2.kaydir("cut-pad", "0.15"); p2.kaydir("cut-minkeep", "0");
  await p2.bekle(160);
  await p2.tikla("cut-apply");
  ok("yedek akış: aynı ayarla Uygula silencedetect'i yeniden koşmaz", p2.kayit.run.length === 1 && p2.kayit.call.length === 1 && p2.kayit.harca.length === 1, p2.kayit.run.length);

  await zamanEkseniTestleri(K, stereo);
  await kararTestleri(K, klip);
  await iptalTestleri(K, stereo, klip);
  await sahteTestler(K);
}

/* ---- PTS: ses akışı geç başlıyor / boşluklu → zarf silencedetect'le aynı eksende (±50 ms) ---- */
async function zamanEkseniTestleri(K, stereo) {
  // Video 0'da, ses 0.5 sn'de başlar (OBS, ekran kaydı, AVCHD/MTS'de olağan)
  var kaymali = pathm.join(TMP, "kaymali.mkv");
  var u = cp.spawnSync(FF, ["-hide_banner", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=25:d=6",
    "-itsoffset", "0.5", "-i", stereo, "-map", "0:v", "-map", "1:a", "-c:v", "mpeg4", "-c:a", "pcm_s16le", kaymali], { encoding: "utf8", timeout: 60000 });
  // Ses içinde 0.3 sn'lik PTS boşluğu (ilk tonun ortasında): sonraki her şey 0.3 sn kayar
  var bosluklu = pathm.join(TMP, "bosluklu.mkv");
  var u2 = cp.spawnSync(FF, ["-hide_banner", "-y", "-i", stereo, "-af", "asetpts=PTS+if(gte(T\\,0.5)\\,0.3/TB\\,0)",
    "-c:a", "pcm_s16le", bosluklu], { encoding: "utf8", timeout: 60000 });
  if (u.status !== 0 || u2.status !== 0) { ok("PTS test dosyaları üretildi", false, String(u.stderr || u2.stderr).slice(-200)); return; }

  // Panelin Uygula'daki silencedetect'i: aynı zaman süzgecinden geçer (baştaki doldurulmuş boşluğu da görür)
  function sdPanel(dosya, esik, d, inPoint, dur) {
    return parseSilence(cp.spawnSync(FF, ["-hide_banner", "-ss", String(inPoint), "-t", String(dur), "-i", dosya, "-map", "0:a:0?",
      "-af", S.ZAMAN_SUZGECI + ",silencedetect=noise=" + esik + "dB:d=" + d, "-f", "null", "-"], { encoding: "utf8", timeout: 60000 }).stderr || "");
  }
  var durumlar = [[kaymali, 0, 5.5, "ses 0.5 sn geç, in 0"], [kaymali, 0.2, 5.0, "ses 0.5 sn geç, in kaymanın içinde (0.2)"],
    [kaymali, 1.0, 4.0, "ses 0.5 sn geç, in 1.0"], [bosluklu, 0, 5.3, "0.3 sn PTS boşluğu"]];
  for (var i = 0; i < durumlar.length; i++) {
    var d = durumlar[i];
    var c = await cozumle(K, d[0], d[1], d[2]);
    var z = S.sessizAraliklar(c.zarf, { esik: -30, minSessizlik: 0.4, sure: d[2] });
    // düz silencedetect (3.3): kare PTS'i; baştaki boşlukta örnek yok, onu raporlamaz → zarfın baştaki aralığı hariç
    var sd = silencedetect(d[0], -30, 0.4, d[1], d[2]);
    var zIc = z.filter(function (r) { return r.start > 0.01; });
    ok("PTS (" + d[3] + "): zarf düz silencedetect ile aynı eksende ±50 ms (kayma yok)", c.res.code === 0 && sd.length > 0 && yakinListe(zIc.slice(0, sd.length), sd, 0.05), yaz(z) + " vs " + yaz(sd));
    var sp = sdPanel(d[0], -30, 0.4, d[1], d[2]);
    ok("PTS (" + d[3] + "): zarf panelin doğrulamasıyla (süzgeçli silencedetect) tümüyle ±50 ms", sp.length > 0 && yakinListe(z.slice(0, sp.length), sp, 0.05), yaz(z) + " vs " + yaz(sp));
  }
  // Panel uçtan uca: geç başlayan seste önizleme doğrulamayla aynı → Uygula tek tıkla, fark uyarısı yok
  var p = kabi.kesimPaneli({ K: K, ffmpeg: FF, clip: { mediaPath: kaymali, inPoint: 0, outPoint: 5.5, clipStart: 0, clipEnd: 5.5 } });
  await p.tikla("cut-analyze");
  var onizleme = p.el("cut-summary").textContent;
  await p.tikla("cut-apply");
  var cagri = p.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; });
  ok("PTS panel: geç başlayan seste Uygula önizlenen kesimleri tek tıkla uygular", /^2 kesim/.test(onizleme) && cagri.length === 1 && cagri[0].payload.ranges.length === 2 &&
    !/Doğrulama kesimleri değiştirdi/.test(p.el("cut-status").textContent), onizleme + " / " + p.el("cut-status").textContent + " " + JSON.stringify(cagri.length && cagri[0].payload.ranges));
  ok("PTS panel: doğrulama silencedetect'i zaman süzgecinden geçer", p.kayit.run.length === 1 && p.kayit.run[0][p.kayit.run[0].indexOf("-af") + 1].indexOf(S.ZAMAN_SUZGECI + ",silencedetect=") === 0, (p.kayit.run[0] || []).join(" "));
}

/* ---- Kullanıcı kararları ara kaydırıcı konumlarında kaybolmaz / komşuya yayılmaz (gerçek ffmpeg) ---- */
async function kararTestleri(K, klip) {
  function kesimDurumu(p) {
    return p.el("cut-bar").children.filter(function (s) { return /\bcut\b/.test(s.className) && !/ parca/.test(s.className); })
      .map(function (s) { return / off/.test(s.className) ? "k" : "a"; }).join("");
  }
  var p = kabi.kesimPaneli({ K: K, ffmpeg: FF, clip: klip });
  await p.tikla("cut-analyze");
  var satirlar = p.el("cut-ranges").children;
  ok("kararlar: analiz 2 kesim, liste 2 satır", satirlar.length === 2 && kesimDurumu(p) === "aa", kesimDurumu(p));
  // ikinci kesimi listeden kapat (13.35–13.95)
  satirlar[1].children[0].checked = false;
  satirlar[1].children[0].onchange();
  ok("kararlar: liste onay kutusu kesimi kapatır", kesimDurumu(p) === "ak" && /^1 kesim/.test(p.el("cut-summary").textContent), p.el("cut-summary").textContent);

  p.kaydir("cut-minsil", "1.0");
  await p.bekle(160);
  ok("ara konum (min. sessizlik 1.0): kapatılanla örtüşen kesim yok", kesimDurumu(p) === "a", kesimDurumu(p));
  p.kaydir("cut-minsil", "0.8");
  await p.bekle(160);
  ok("geri (0.8): kapatılan kesim yine kapalı (karar ara konumda kaybolmaz)", kesimDurumu(p) === "ak", kesimDurumu(p));

  p.kaydir("cut-minsil", "2.5");
  await p.bekle(160);
  ok("ara konum (2.5): hiç kesim yok", kesimDurumu(p) === "" && /duraksama yok/.test(p.el("cut-status").textContent), p.el("cut-status").textContent);
  p.kaydir("cut-minsil", "0.8");
  await p.bekle(160);
  ok("hiç kesimsiz konumdan dönüş: kapatılan kesim kapalı", kesimDurumu(p) === "ak", kesimDurumu(p));

  // birleşme: Tampon 0 + Min. konuşma 0.65 → tek birleşik kesim (kapatılanı yutar → kapalı); ayrılınca yayılmaz
  p.kaydir("cut-pad", "0");
  p.kaydir("cut-minkeep", "0.65");
  await p.bekle(160);
  var parcalar = p.el("cut-bar").children.filter(function (s) { return / parca/.test(s.className); });
  ok("birleşik kesim kapatılanı yutar → kapalı", parcalar.length > 0 && parcalar.every(function (s) { return / off/.test(s.className); }) && /^0 kesim/.test(p.el("cut-summary").textContent), p.el("cut-summary").textContent);
  p.kaydir("cut-minkeep", "0");
  p.kaydir("cut-pad", "0.15");
  await p.bekle(160);
  ok("ayrılınca: yalnız kullanıcının kapattığı kesim kapalı, komşusu açık (kapalı yayılmaz)", kesimDurumu(p) === "ak", kesimDurumu(p));

  await p.tikla("cut-apply");
  var cagri = p.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; });
  ok("kararlar: Uygula kapatılan bölgeyi (13.35–13.95) kesmez",
    cagri.length === 1 && cagri[0].payload.ranges.length === 1 && cagri[0].payload.ranges[0].end < 13 &&
    !cagri[0].payload.ranges.some(function (r) { return r.end > 13.35 && r.start < 13.95; }), JSON.stringify(cagri.length && cagri[0].payload.ranges));
}

/* ---- Yeniden analiz İptal: başka klibin (in/out kaymış) önceki zarfı yeni klibe uygulanmaz ---- */
async function iptalTestleri(K, stereo, klip) {
  var askida = false;
  var KA = {};
  for (var k in K) KA[k] = K[k];
  KA.runAkis = function (cmd, args, opts) {
    if (!askida) return K.runAkis(cmd, args, opts);
    return new Promise(function (coz) {
      var t = setInterval(function () {
        if (opts.iptal && opts.iptal.iptalEdildi) { clearInterval(t); coz({ code: -2, iptal: true, stderr: "", bayt: 0 }); }
      }, 10);
    });
  };
  var p = kabi.kesimPaneli({ K: KA, ffmpeg: FF, clip: klip });
  await p.tikla("cut-analyze");
  ok("iptal öncesi: ilk klip analiz edildi (2 kesim)", /^2 kesim/.test(p.el("cut-summary").textContent) && !p.el("cut-result").hidden);
  // Premiere'de klip kaydırıldı (slip): medya ve klipStart aynı, in/out farklı → onContext sıfırlamaz
  p.ctx({ mediaPath: stereo, inPoint: 1.0, outPoint: 4.5, clipStart: 10, clipEnd: 13.5 });
  askida = true;
  await p.bekle(560);
  var analiz = p.tikla("cut-analyze");
  await p.bekle(560);   // İptal düğmesi açıldıktan sonraki çift tık koruması
  await p.tikla("cut-cancel");
  await analiz;
  ok("yeni klipte İptal: eski klibin sonucu gizlendi", p.el("cut-result").hidden === true && /İptal edildi/.test(p.el("cut-status").textContent), p.el("cut-status").textContent);
  p.kaydir("cut-pad", "0.1");
  await p.bekle(160);
  var kesimSpan = p.el("cut-bar").children.filter(function (s) { return /\bcut\b/.test(s.className); });
  ok("İptal sonrası kaydırıcı: eski zarftan yeni klibe kesim kurulmaz", p.el("cut-result").hidden === true && kesimSpan.length === 0 &&
    p.el("cut-ranges").children.length === 0 && /^0 kesim/.test(p.el("cut-summary").textContent) && p.el("cut-apply").disabled === true, p.el("cut-summary").textContent);
  p.tikla("cut-noise-auto");
  ok("İptal sonrası Otomatik: eski zarfı kullanmaz", /Önce Sessizlikleri bul/.test(p.el("cut-status").textContent), p.el("cut-status").textContent);
  askida = false;
}

/* ---- Sahte ffmpeg: önizleme ↔ doğrulama farkı ve yarım silencedetect sonucu ---- */
function pcmMono(parcalar) {
  var n = 0;
  parcalar.forEach(function (p) { n += Math.round(p[0] * 16000); });
  var b = Buffer.alloc(n * 2), i = 0;
  parcalar.forEach(function (p) {
    var m = Math.round(p[0] * 16000);
    for (var j = 0; j < m; j++, i++) b.writeInt16LE(p[1] ? (j % 2 ? 8000 : -8000) : 0, i * 2);
  });
  return b;
}
var CIKIS = "Output #0, s16le, to 'pipe:1':\n  Stream #0:0: Audio: pcm_s16le, 16000 Hz, mono, s16, 256 kb/s\n";
function sdCiktisi(l) {
  return l.map(function (x) { return "[silencedetect @ 0x1] silence_start: " + x[0] + "\n[silencedetect @ 0x1] silence_end: " + x[1] + " | silence_duration: " + (x[1] - x[0]).toFixed(3) + "\n"; }).join("");
}

async function sahteTestler(K) {
  /* 1) Önizleme 1 kesim, doğrulama 2 kesim: Uygula sormadan uygulamaz, ikinci tık uygular */
  var pcm = pcmMono([[1.2, 1], [0.79, 0], [1.5, 1], [1.2, 0], [1.0, 1]]);   // 5.69 sn
  var K1 = {};
  for (var k in K) K1[k] = K[k];
  K1.runAkis = function (cmd, args, opts) {
    opts.onStderr(CIKIS);
    for (var o = 0; o < pcm.length; o += 4000) opts.onData(pcm.slice(o, o + 4000));
    return Promise.resolve({ code: 0, stderr: CIKIS, bayt: pcm.length });
  };
  K1.run = function () { return Promise.resolve({ code: 0, stderr: sdCiktisi([[1.2, 2.0], [3.49, 4.69]]) }); };
  var klip = { mediaPath: "/sahte/klip.mp4", inPoint: 0, outPoint: 5.69, clipStart: 20, clipEnd: 25.69 };
  var p = kabi.kesimPaneli({ K: K1, ffmpeg: "ffmpeg", clip: klip });
  await p.tikla("cut-analyze");
  ok("fark: önizleme (zarf) 1 kesim", /^1 kesim/.test(p.el("cut-summary").textContent), p.el("cut-summary").textContent);
  await p.tikla("cut-apply");
  var uygulama = function () { return p.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; }); };
  ok("fark: doğrulama 2 kesim buldu → KS_applyCuts çağrılmadı, hak düşmedi", uygulama().length === 0 && p.kayit.harca.length === 0 && p.kayit.run.length === 1);
  ok("fark: doğrulanmış küme haritada, durum satırı söylüyor, Uygula açık",
    /^2 kesim/.test(p.el("cut-summary").textContent) && /Doğrulama kesimleri değiştirdi \(önizleme 1 kesim, doğrulama 2 kesim\)/.test(p.el("cut-status").textContent) &&
    /warn/.test(p.el("cut-status").className) && p.el("cut-apply").disabled === false, p.el("cut-status").textContent);
  await p.bekle(560);
  await p.tikla("cut-apply");
  ok("fark: ikinci tık doğrulanmış 2 kesimi uygular, ffmpeg yeniden koşmaz",
    uygulama().length === 1 && uygulama()[0].payload.ranges.length === 2 && p.kayit.run.length === 1 && p.kayit.harca.length === 1,
    JSON.stringify(uygulama().length && uygulama()[0].payload.ranges));

  // aynı durumda kaydırıcı oynarsa uyarı silinir (harita yeniden önizleme)
  var p1 = kabi.kesimPaneli({ K: K1, ffmpeg: "ffmpeg", clip: klip });
  await p1.tikla("cut-analyze");
  await p1.tikla("cut-apply");
  p1.kaydir("cut-pad", "0.1");
  await p1.bekle(160);
  ok("fark uyarısı: kaydırıcı haritayı önizlemeye döndürünce silinir", p1.el("cut-status").textContent === "" && /^1 kesim/.test(p1.el("cut-summary").textContent), p1.el("cut-status").textContent);

  /* 2) Çözümleme yok, silencedetect hatayla biter ama aralık verir: gösterilen yarım sonuç uygulanabilir */
  var K2 = {};
  for (var k2 in K) K2[k2] = K[k2];
  K2.runAkis = function () { return Promise.resolve({ code: 1, stderr: "Error while decoding stream", bayt: 0 }); };
  K2.run = function () { return Promise.resolve({ code: 1, stderr: sdCiktisi([[1.2, 2.6], [3.2, 4.1]]) + "Error while decoding stream #0:0\n" }); };
  var klip2 = { mediaPath: "/sahte/bozuk.mp4", inPoint: 0, outPoint: 6, clipStart: 0, clipEnd: 6 };
  var q = kabi.kesimPaneli({ K: K2, ffmpeg: "ffmpeg", clip: klip2 });
  await q.tikla("cut-analyze");
  ok("yarım sonuç: 2 kesim, 'tamamlanamadı' uyarısı, Uygula açık",
    /^2 kesim/.test(q.el("cut-summary").textContent) && /tamamlanamadı/.test(q.el("cut-status").textContent) && q.el("cut-apply").disabled === false && q.kayit.run.length === 1,
    q.el("cut-summary").textContent + " / " + q.el("cut-status").textContent);
  await q.tikla("cut-apply");
  var qc = q.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; });
  ok("yarım sonuç: Uygula ekrandaki kesimleri uygular (silencedetect yeniden koşup başarısız olmaz)",
    qc.length === 1 && qc[0].payload.ranges.length === 2 && q.kayit.run.length === 1 && !/başarısız/.test(q.el("cut-status").textContent),
    q.el("cut-status").textContent + " " + JSON.stringify(qc.length && qc[0].payload.ranges));

  /* 3) "birleşik" rozeti İngilizce arayüzde çevrilir: #cut-ranges içinde arayüz adacığı */
  var pcm3 = pcmMono([[1.0, 1], [0.9, 0], [0.3, 1], [0.9, 0], [1.0, 1]]);   // 4.1 sn, araya giren 0.3 sn konuşma
  var K3 = {};
  for (var k3 in K1) K3[k3] = K1[k3];
  K3.runAkis = function (cmd, args, opts) {
    opts.onStderr(CIKIS);
    opts.onData(pcm3);
    return Promise.resolve({ code: 0, stderr: CIKIS, bayt: pcm3.length });
  };
  var p3 = kabi.kesimPaneli({ K: K3, ffmpeg: "ffmpeg", clip: { mediaPath: "/sahte/kisa.mp4", inPoint: 0, outPoint: 4.1, clipStart: 0, clipEnd: 4.1 } });
  await p3.tikla("cut-analyze");
  p3.kaydir("cut-minkeep", "0.65");
  await p3.bekle(160);
  var rozet = null;
  p3.el("cut-ranges").children.forEach(function (row) { row.children.forEach(function (c) { if (/mc-birlesik/.test(c.className)) rozet = c; }); });
  ok("birleşik rozeti data-i18n-ui adacığı (kullanıcı kabında çevrilsin)", rozet && rozet.getAttribute("data-i18n-ui") === "" && rozet.textContent === "birleşik" &&
    /^1 kesim/.test(p3.el("cut-summary").textContent), rozet ? JSON.stringify(rozet.attrs) : "rozet yok: " + p3.el("cut-summary").textContent);
}

canliTestler().catch(function (e) { ok("canli esik testleri coktu: " + (e && e.stack || e), false); }).then(function () {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
});
