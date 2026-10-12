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
}

canliTestler().catch(function (e) { ok("canli esik testleri coktu: " + (e && e.stack || e), false); }).then(function () {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
});
