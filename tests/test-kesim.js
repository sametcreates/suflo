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
// koşuya özel klasör: aynı makinede eşzamanlı iki koşu (iki çalışma ağacı, CI matrisi) birbirinin wav'ını silmesin
var TMP = fs.mkdtempSync(pathm.join(os.tmpdir(), "suflo-kesim-test-"));

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

// Panelin zarfCikar'ıyla aynı: kanal sayısı VE örnekleme hızı ffmpeg'in "Output #0" satırından
function cozumle(K, dosya, inPoint, dur) {
  var st = S.tepeZarfi(), bilgi = { kanal: 0, sr: 0 }, stderr = "", bekleyen = [];
  function besle(b) { S.zarfBesle(st, b, { kanal: bilgi.kanal, sr: bilgi.sr }); }
  return K.runAkis(FF, S.cozumlemeArgs(dosya, inPoint, dur), {
    timeout: 60000,
    onStderr: function (s) {
      if (bilgi.kanal) return;
      stderr += s; bilgi = S.cikisBilgisi(stderr);
      if (bilgi.kanal) { bekleyen.forEach(besle); bekleyen = []; }
    },
    onData: function (b) { if (bilgi.kanal) besle(b); else bekleyen.push(b); }
  }).then(function (res) {
    if (!bilgi.kanal) { bilgi = S.cikisBilgisi(res.stderr); bekleyen.forEach(besle); }
    return { res: res, kanal: bilgi.kanal, sr: bilgi.sr, zarf: S.zarfBitir(st) };
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
  ok("tek çözümleme: kod 0, 2 kanal, özgün 44.1 kHz okundu (16 kHz'e inmez), ~510 pencere (10 ms)", c.res.code === 0 && c.kanal === 2 && c.sr === 44100 && Math.abs(c.zarf.length - 510) <= 2, c.kanal + " kanal, " + c.sr + " Hz, " + c.zarf.length);
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
  // Premiere'e iki çağrı: klibin yerinin taze denetimi (KS_getContext), sonra KS_applyCuts
  ok("yedek akış: aynı ayarla Uygula silencedetect'i yeniden koşmaz", p2.kayit.run.length === 1 &&
    p2.kayit.call.map(function (x) { return x.fn; }).join(",") === "KS_getContext,KS_applyCuts" && p2.kayit.harca.length === 1,
    p2.kayit.run.length + " " + p2.kayit.call.map(function (x) { return x.fn; }).join(","));

  await zamanEkseniTestleri(K, stereo);
  await ornekHiziTestleri(K);
  await kararTestleri(K, klip);
  await iptalTestleri(K, stereo, klip);
  await sahteTestler(K);
  await kapsamTestleri(K, stereo);
}

/*
 * ---- 3.4 adım 7: In → Out / Sekans kapsamı ve korunan katmanlar (gerçek ffmpeg, sahte Premiere) ----
 * KS_exportAudio sahtesi stereo.wav'ın kopyasını "sekans karışımı" diye verir (ofset 10 sn = In noktası).
 * Zarf ve silencedetect bu WAV'da koşar; kesimler ofsetle sekans zamanına çevrilir. Uygula'ya protect ve
 * expectSeqId gider; WAV Uygula'dan, kapsam / sekans / dinlenen ses değişiminden sonra silinir.
 */
function duzenYap(o) {
  o = o || {};
  function iz(i, ad, klipler, ek) {
    var x = { index: i, name: ad, locked: false, muted: false, clipCount: klipler.length, first: 0, last: 60, hasMulticam: false, hasMerged: false, klipler: klipler };
    for (var k in (ek || {})) x[k] = ek[k];
    return x;
  }
  return { ok: true, seqId: o.seqId || "seq-1", name: "Vlog", duration: 60,
    video: [iz(0, "Video 1", [{ s: 0, e: 60, ad: "Kamera", yol: "cam.mp4", hiza: 0 }]), iz(1, "Video 2", [{ s: 5, e: 50, ad: "Başlık", yol: "baslik.mogrt", hiza: -5 }], { first: 5, last: 50 })],
    audio: o.yalnizMuzik ? [iz(0, "Müzik", [{ s: 0, e: 60, ad: "sarki.mp3", yol: "sarki.mp3", hiza: 0, bag: [] }])] :
      [iz(0, "Audio 1", [{ s: 0, e: 60, ad: "Kamera", yol: "cam.mp4", hiza: 0, bag: [{ s: 0, e: 60, yol: "cam.mp4", tur: "Video" }] }]),
        iz(1, "Müzik", [{ s: 0, e: 60, ad: "sarki.mp3", yol: "sarki.mp3", hiza: 0, bag: [] }])] };
}
/*
 * Sahte Premiere'in kapsam değerleri (KS_getTrackLayout({ scope }) → kapsam, okuma anındaki In / Out): In → Out
 * kapsamında sekans 60 sn, In / Out o.hostIn / o.hostOut (yoksa panel bağlamınınki: 10–15.1); Sekans kapsamında
 * karışım stereo.wav'ın kendisi olduğundan sekans 5.1 sn. Bağlam (KApp.ctx) bundan farklı olabilir: bayat bağlam.
 */
function sahteKapsam(yuk, o) {
  if (!yuk || !yuk.scope) return undefined;
  var a = o.hostIn !== undefined ? o.hostIn : o.seqIn !== undefined ? o.seqIn : 10;
  var b = o.hostOut !== undefined ? o.hostOut : o.seqOut !== undefined ? o.seqOut : 15.1;
  return { scope: yuk.scope, seqIn: a, seqOut: b, seqDur: yuk.scope === "entire" ? 5.1 : (o.hostDur || 60), frame: 0.04 };
}
// KS_exportAudio sahtesinin ofset / süresi: sahte Premiere'in o anki In / Out'u (o.disaKapsam ile okumadan sonra değişebilir)
function sahteDisaAralik(yuk, o) {
  var k = (o.disaKapsam ? o.disaKapsam() : null) || sahteKapsam({ scope: yuk.scope }, o);
  return yuk.scope === "inout" ? { offset: k.seqIn, duration: k.seqOut - k.seqIn } : { offset: 0, duration: k.seqDur };
}
function kapsamPaneli(K, stereo, o) {
  o = o || {};
  var wavlar = [], sayac = 0;
  var p = kabi.kesimPaneli({ K: K, ffmpeg: FF, clip: o.clip || null,
    ctx: { hasSeq: true, sequenceId: "seq-1", seqIn: o.seqIn !== undefined ? o.seqIn : 10, seqOut: o.seqOut !== undefined ? o.seqOut : 15.1, seqDur: o.seqDur || 60, frame: 0.04 },
    call: function (fn, yuk) {
      if (fn === "KS_getTrackLayout") { var d = duzenYap(o.duzen); d.kapsam = sahteKapsam(yuk, o); return d; }
      if (fn === "KS_exportAudio") {
        if (o.disaAktarmaHata) return { ok: false, error: "Ses disari alinamadi." };
        var hedef = pathm.join(TMP, "seq_karisim_" + (++kapsamWavSayac) + ".wav");
        fs.copyFileSync(stereo, hedef);
        wavlar.push(hedef);
        var da = sahteDisaAralik(yuk, o);
        return { ok: true, wav: hedef, offset: da.offset, duration: da.duration };
      }
      if (fn === "KS_applyCuts") return o.uygula ? o.uygula(yuk) : { ok: true, newSeq: "Vlog - kopya", removed: 4, selected: 0, rippleFallback: false, protectedSkipped: { video: 0, audio: 1 } };
      return { ok: false, error: "beklenmeyen " + fn };
    } });
  p.wavlar = wavlar;
  p.cagrilar = function (fn) { return p.kayit.call.filter(function (x) { return x.fn === fn; }); };
  return p;
}
var kapsamWavSayac = 0;
function cipler(p, id) {
  return p.el(id).children.map(function (b) {
    var sp = b.children.filter(function (c) { return c.tagName === "SPAN"; })[0];
    return (sp ? sp.textContent : "?") + (/\bon\b/.test(b.className) ? "+" : "") + (/oneri/.test(b.className) ? "~" : "");
  });
}

async function kapsamTestleri(K, stereo) {
  var beklenen = S.kesimlereCevir(silencedetect(stereo, -38, 0.8, 0, 5.1), { pay: 0.15, sure: 5.1 }).kesimler;

  /* a) In → Out: katmanlar, dışa aktarım, ofset, Uygula'da protect + expectSeqId, WAV silinir */
  var p = kapsamPaneli(K, stereo);
  ok("kapsam: seçili klip yokken Sessizlikleri bul kapalı", p.el("cut-analyze").disabled === true, p.el("cut-status").textContent);
  p.kapsam("inout");
  await p.bekle(20);
  var lc = p.cagrilar("KS_getTrackLayout");
  // aralığı panel bağlamından değil Premiere okuma anında kendi In / Out'undan verir (scope); bağlam bayat olabilir
  ok("kapsam In → Out: katmanlar okundu (klipler, aralık Premiere'in In / Out'u: scope inout, start / end yok), Sessizlikleri bul açık",
    lc.length === 1 && lc[0].payload.klipler === true && lc[0].payload.scope === "inout" && lc[0].payload.start === undefined && lc[0].payload.end === undefined &&
    p.el("cut-analyze").disabled === false,
    JSON.stringify(lc.map(function (x) { return x.payload; })));
  ok("çip satırları: Dinlenecek ses A1 (kamera sesi), Müzik dinlenmez",
    p.el("cut-dinle-satir").hidden === false && JSON.stringify(cipler(p, "cut-dinle-izler")) === JSON.stringify(["A1+", "A2 · Müzik"]), JSON.stringify(cipler(p, "cut-dinle-izler")));
  ok("çip satırları: Kesilmeyecek katmanlar V1 V2 A1 A2 — yalnız 'Müzik' işaretli (video hiç)",
    p.el("cut-koru-satir").hidden === false && JSON.stringify(cipler(p, "cut-koru-izler")) === JSON.stringify(["V1", "V2", "A1", "A2 · Müzik+"]), JSON.stringify(cipler(p, "cut-koru-izler")));
  ok("katman özeti: '1 dinlenen · 1 korunan'", p.el("cut-katman-ozet").textContent === "1 dinlenen · 1 korunan", p.el("cut-katman-ozet").textContent);

  await p.tikla("cut-analyze");
  var ex = p.cagrilar("KS_exportAudio");
  ok("analiz: KS_exportAudio In/Out, yalnız dinlenecek A1, susturulmuşsa açılır",
    ex.length === 1 && ex[0].payload.scope === "inout" && JSON.stringify(ex[0].payload.tracks) === "[0]" && ex[0].payload.unmuteWanted === true,
    JSON.stringify(ex.length && ex[0].payload));
  ok("analiz: zarf karışım WAV'ından (tek runAkis), silencedetect yok, hak düşmedi",
    p.kayit.runAkis.length === 1 && p.kayit.runAkis[0].indexOf(p.wavlar[0]) !== -1 && p.kayit.run.length === 0 && p.kayit.harca.length === 0 && /^2 kesim/.test(p.el("cut-summary").textContent),
    p.el("cut-summary").textContent + " / " + p.el("cut-status").textContent);
  var satir0 = p.el("cut-ranges").children[0].children[1].textContent;
  // liste önizlemeyi (zarf) gösterir: silencedetect'le ±50 ms, ekranda onda bire yuvarlı
  ok("kesim listesi sekans zamanında (In 10 sn + karışımdaki konum)", /^0:1\d\.\d$/.test(satir0) && Math.abs(parseFloat(satir0.slice(2)) - (10 + beklenen[0].start)) <= 0.11,
    satir0 + " beklenen ~" + (10 + beklenen[0].start).toFixed(2));
  await p.tikla("cut-apply");
  var ac = p.cagrilar("KS_applyCuts");
  ok("Uygula: kesimler sekans zamanında (ofset 10), protect A2, expectSeqId seq-1, kopya + ripple",
    ac.length === 1 && Math.abs(ac[0].payload.ranges[0].start - (10 + beklenen[0].start)) < 1e-6 && Math.abs(ac[0].payload.ranges[1].end - (10 + beklenen[1].end)) < 1e-6 &&
    JSON.stringify(ac[0].payload.protect) === JSON.stringify({ video: [], audio: [1] }) && ac[0].payload.expectSeqId === "seq-1" &&
    ac[0].payload.cloneFirst === true && ac[0].payload.removeMode === "ripple" && p.kayit.run.length === 1 && p.kayit.run[0].indexOf(p.wavlar[0]) !== -1,
    JSON.stringify(ac.length && ac[0].payload));
  // inceleme r2: sekans kapsamı host'tan eşit kayma kuralını ister (kliplerin arasındaki boşluk ripple'ı boşluk moduna düşürmesin)
  ok("Uygula (In → Out): esitKayma: true gönderilir", ac.length === 1 && ac[0].payload.esitKayma === true, JSON.stringify(ac.length && ac[0].payload));
  ok("Uygula: hak bir kez düştü, toast korunan katmanı söyler, karışım WAV'ı silindi",
    p.kayit.harca.length === 1 && p.kayit.toast.some(function (t) { return /korunan: A2/.test(t[0]); }) && !fs.existsSync(p.wavlar[0]),
    JSON.stringify(p.kayit.toast));

  /* b) Korunan video + ripple: Uygula kapalı, "Boşluk bırakarak uygula" gap gönderir */
  var q = kapsamPaneli(K, stereo);
  q.kapsam("entire");
  await q.bekle(20);
  await q.tikla("cut-analyze");
  ok("Sekans kapsamı: KS_exportAudio entire", q.cagrilar("KS_exportAudio")[0].payload.scope === "entire" && /^2 kesim/.test(q.el("cut-summary").textContent), q.el("cut-summary").textContent);
  q.el("cut-koru-izler").children[1].onclick();   // V2'yi koru
  var uyari = q.el("cut-koru-uyari");
  var bosluk = uyari.children.filter(function (c) { return c.id === "cut-bosluk-uygula"; })[0];
  ok("korunan V2 + ripple (Kopya sekansta): uyarı görünür, Kesimleri uygula kapalı, Boşluk bırakarak uygula açık",
    uyari.hidden === false && /Korunan video katmanı \(V2\) Ripple'da kaymaz/.test(uyari.children[0].textContent) && q.el("cut-apply").disabled === true && bosluk && bosluk.disabled === false,
    uyari.children.map(function (c) { return c.textContent; }).join(" | "));
  await q.tikla("cut-apply");
  ok("korunan V2 + ripple: düz Uygula hiçbir şey göndermez", q.cagrilar("KS_applyCuts").length === 0 && q.kayit.run.length === 0);
  await bosluk.onclick();
  var qa = q.cagrilar("KS_applyCuts");
  ok("Boşluk bırakarak uygula: removeMode gap, protect V2 + A2, kopya sekansta",
    qa.length === 1 && qa[0].payload.removeMode === "gap" && JSON.stringify(qa[0].payload.protect) === JSON.stringify({ video: [1], audio: [1] }) && qa[0].payload.cloneFirst === true,
    JSON.stringify(qa.length && qa[0].payload));

  /* c) Bağlı çift uyarısı: kamera sesi A1 korunurken görüntüsü V1 kesiliyor */
  var r = kapsamPaneli(K, stereo);
  r.kapsam("inout");
  await r.bekle(20);
  await r.tikla("cut-analyze");
  r.el("cut-koru-izler").children[2].onclick();   // A1'i koru
  var ru = r.el("cut-koru-uyari");
  ok("bağlı çift uyarısı: 'Bağlı klipler ayrılacak' + 'A1 korunuyor, V1 kesiliyor' (Uygula açık kalır)",
    ru.hidden === false && ru.children.some(function (c) { return /Bağlı klipler ayrılacak/.test(c.textContent); }) &&
    ru.children.some(function (c) { return c.tagName === "UL" && c.children.some(function (li) { return /A1 korunuyor, V1 kesiliyor/.test(li.textContent); }); }) && r.el("cut-apply").disabled === false,
    ru.children.map(function (c) { return c.textContent; }).join(" | "));

  /* d) Dinlenecek ses değişince analiz bayat: sonuç kapanır, WAV silinir */
  var wav1 = r.wavlar[0];
  r.el("cut-dinle-izler").children[1].onclick();   // Müzik'i de dinle
  ok("dinlenen ses değişti: sonuç kapandı, WAV silindi, 'Sessizlikleri yeniden bul' uyarısı",
    r.el("cut-result").hidden === true && !fs.existsSync(wav1) && /Dinlenecek ses değişti/.test(r.el("cut-status").textContent) && JSON.stringify(cipler(r, "cut-dinle-izler")) === JSON.stringify(["A1+", "A2 · Müzik+"]),
    r.el("cut-status").textContent + " " + JSON.stringify(cipler(r, "cut-dinle-izler")));
  await r.bekle(560);
  await r.tikla("cut-analyze");
  ok("yeni analiz iki dinlenen katmanla dışa aktarır", r.cagrilar("KS_exportAudio").length === 2 && JSON.stringify(r.cagrilar("KS_exportAudio")[1].payload.tracks) === "[0,1]" && r.wavlar.length === 2,
    JSON.stringify(r.cagrilar("KS_exportAudio").map(function (x) { return x.payload.tracks; })));

  /* e) Kapsam / sekans değişimi WAV'ı siler */
  var wav2 = r.wavlar[1];
  r.kapsam("clip");
  ok("kapsam Seçili klip'e döndü: sonuç kapandı, WAV silindi, Dinlenecek ses gizli", r.el("cut-result").hidden === true && !fs.existsSync(wav2) && r.el("cut-dinle-satir").hidden === true);
  r.kapsam("entire");
  await r.bekle(580);
  await r.tikla("cut-analyze");
  var wav3 = r.wavlar[2];
  r.ctx(null, { sequenceId: "seq-2" });
  ok("başka sekansa geçildi: analiz geçersiz, WAV silindi, katmanlar boşaldı",
    wav3 && r.el("cut-result").hidden === true && !fs.existsSync(wav3) && r.el("cut-koru-satir").hidden === true, wav3);

  /* f) In / Out yok, dinlenecek ses yok, dışa aktarım hatası */
  var s = kapsamPaneli(K, stereo, { seqIn: 0, seqOut: 0 });
  s.kapsam("inout");
  await s.bekle(20);
  await s.tikla("cut-analyze");
  ok("In / Out yok: uyarı, dışa aktarım yok", /Sekansta In \/ Out yok/.test(s.el("cut-status").textContent) && s.cagrilar("KS_exportAudio").length === 0, s.el("cut-status").textContent);
  var t = kapsamPaneli(K, stereo, { duzen: { yalnizMuzik: true } });
  t.kapsam("entire");
  await t.bekle(20);
  await t.tikla("cut-analyze");
  ok("dinlenecek ses yok (yalnız Müzik): uyarı, dışa aktarım yok", /Dinlenecek bir ses katmanı seç/.test(t.el("cut-status").textContent) && t.cagrilar("KS_exportAudio").length === 0, t.el("cut-status").textContent);
  var u = kapsamPaneli(K, stereo, { disaAktarmaHata: true });
  u.kapsam("entire");
  await u.bekle(20);
  await u.tikla("cut-analyze");
  ok("dışa aktarım hatası: '✕' durum, sonuç yok, ffmpeg çalışmadı", /^✕ Ses disari alinamadi/.test(u.el("cut-status").textContent) && u.el("cut-result").hidden === true && u.kayit.runAkis.length === 0, u.el("cut-status").textContent);

  /* g) Seçili klip kapsamı: Katmanlar açılmadıysa Premiere'e katman sorulmaz, protect gönderilmez */
  var klipK = { mediaPath: stereo, inPoint: 0, outPoint: 5.1, clipStart: 20, clipEnd: 25.1 };
  var v = kapsamPaneli(K, stereo, { clip: klipK });
  await v.tikla("cut-analyze");
  await v.tikla("cut-apply");
  var va = v.cagrilar("KS_applyCuts");
  ok("Seçili klip: katman okunmadı, protect yok, expectSeqId analiz edilen sekans",
    v.cagrilar("KS_getTrackLayout").length === 0 && va.length === 1 && va[0].payload.protect === undefined && va[0].payload.expectSeqId === "seq-1" && Math.abs(va[0].payload.ranges[0].start - (20 + beklenen[0].start)) < 1e-6,
    JSON.stringify(va.length && va[0].payload));

  /* h) Host expectSeqId'yi tutmadı: Türkçe açıklama, hak düşmez, WAV kalır (yeniden denenebilir) */
  var w = kapsamPaneli(K, stereo, { uygula: function () { return { ok: false, kod: "sekans", error: "Etkin sekans degisti; kesimler uygulanmadi. Sessizlikleri yeniden bul." }; } });
  w.kapsam("entire");
  await w.bekle(20);
  await w.tikla("cut-analyze");
  await w.tikla("cut-apply");
  ok("expectSeqId tutmadı: '✕ Etkin sekans değişti: kesimler uygulanmadı…', hak düşmedi, sonuç ve WAV duruyor",
    /^✕ Etkin sekans değişti: kesimler uygulanmadı/.test(w.el("cut-status").textContent) && w.kayit.harca.length === 0 && w.el("cut-result").hidden === false && fs.existsSync(w.wavlar[0]),
    w.el("cut-status").textContent);
  w.kapsam("clip");
  ok("kapsam değişimi bu WAV'ı da siler", !fs.existsSync(w.wavlar[0]));

  await kapsamInceleme(K, stereo, klipK);
}

/*
 * ---- 3.4 adım 7 incelemesi: korunan katman kimliği, host'un sekans kimliği, açık Katmanlar bölümü, uyarı metinleri,
 * Windows'ta silinemeyen karışım WAV'ı ----
 */
function sahtePanel(K, stereo, o) {
  var wavlar = [];
  var p = kabi.kesimPaneli({ K: K, ffmpeg: FF, clip: o.clip || null, fs: o.fs,
    ctx: o.ctx || { hasSeq: true, sequenceId: "seq-1", seqIn: 10, seqOut: 15.1, seqDur: 60, frame: 0.04 },
    call: function (fn, yuk) {
      if (fn === "KS_getTrackLayout") {
        var d = o.duzen(yuk);
        if (d && d.ok && !d.kapsam) d.kapsam = sahteKapsam(yuk, o);
        return d;
      }
      if (fn === "KS_exportAudio") {
        var hedef = pathm.join(TMP, "seq_inceleme_" + (++kapsamWavSayac) + ".wav");
        fs.copyFileSync(stereo, hedef);
        wavlar.push(hedef);
        if (o.disaAktarildi) o.disaAktarildi(hedef);
        var da = sahteDisaAralik(yuk, o);
        return { ok: true, wav: hedef, offset: da.offset, duration: da.duration, seqId: o.disaSeqId ? o.disaSeqId() : "seq-1" };
      }
      if (fn === "KS_applyCuts") return o.uygula ? o.uygula(yuk) : { ok: true, newSeq: "Vlog - kopya", removed: 4, selected: 0, rippleFallback: false, protectedSkipped: { video: 0, audio: 1 } };
      return { ok: false, error: "beklenmeyen " + fn };
    } });
  p.wavlar = wavlar;
  p.cagrilar = function (fn) { return p.kayit.call.filter(function (x) { return x.fn === fn; }); };
  return p;
}
// A2'ye yeni boş katman eklenmiş düzen: müzik A3'e kaydı
function muzikKaydi(seqId) {
  var d = duzenYap({ seqId: seqId });
  d.audio.splice(1, 0, { index: 1, name: "Audio 2", locked: false, muted: false, clipCount: 0, first: 0, last: 0, klipler: [] });
  d.audio.forEach(function (iz, i) { iz.index = i; });
  return d;
}

async function kapsamInceleme(K, stereo, klipK) {
  var IPUCU = "Katmanlar sekanstan okunur: bu bölümü açınca ya da Sessizlikleri bul'da.";

  /* a) Seçili klip: Katmanlar açık, sekans değişti (düzen düştü): Sessizlikleri bul yeniden okur, protect gider */
  var seqNow = "seq-1";
  var a = sahtePanel(K, stereo, { clip: klipK, duzen: function () { return duzenYap({ seqId: seqNow }); } });
  a.el("cut-katman").open = true;
  a.el("cut-katman").fire("toggle");
  await a.bekle(20);
  ok("klip kapsamı: Katmanlar açılınca düzen okundu, Müzik korunuyor", a.cagrilar("KS_getTrackLayout").length === 1 &&
    JSON.stringify(cipler(a, "cut-koru-izler")) === JSON.stringify(["V1", "V2", "A1", "A2 · Müzik+"]), JSON.stringify(cipler(a, "cut-koru-izler")));
  seqNow = "seq-2";
  var klip2 = { mediaPath: stereo, inPoint: 0, outPoint: 5.1, clipStart: 30, clipEnd: 35.1 };
  a.ctx(klip2, { sequenceId: "seq-2" });
  ok("sekans değişti, bölüm açık: düzen düştü, ipucu Sessizlikleri bul'un okuyacağını söylüyor", a.el("cut-katman-ipucu").textContent === IPUCU && a.el("cut-koru-satir").hidden === true,
    a.el("cut-katman-ipucu").textContent);
  await a.tikla("cut-analyze");
  var al = a.cagrilar("KS_getTrackLayout");
  ok("Sessizlikleri bul: açık bölüm düzensizken katmanlar bu klibin aralığıyla yeniden okundu",
    al.length === 2 && al[1].payload.start === 30 && Math.abs(al[1].payload.end - 35.1) < 1e-9, JSON.stringify(al.map(function (x) { return x.payload; })));
  await a.tikla("cut-apply");
  var aa = a.cagrilar("KS_applyCuts");
  ok("Uygula: seq-2'de de Müzik korunur (protect + expectTracks), expectSeqId seq-2",
    aa.length === 1 && JSON.stringify(aa[0].payload.protect) === JSON.stringify({ video: [], audio: [1] }) && aa[0].payload.expectSeqId === "seq-2" &&
    JSON.stringify(aa[0].payload.expectTracks) === JSON.stringify({ video: ["Video 1", "Video 2"], audio: ["Audio 1", "Müzik"] }),
    JSON.stringify(aa.length && aa[0].payload));

  /* a2) Bölüm sekanssızken açıldı, sonra sekans açıldı: ipucu tazelenir (Premiere'e gidilmez), Sessizlikleri bul okur */
  var b = sahtePanel(K, stereo, { ctx: { hasSeq: false }, duzen: function () { return duzenYap(); } });
  b.el("cut-katman").open = true;
  b.el("cut-katman").fire("toggle");
  await b.bekle(20);
  var bIlk = b.el("cut-katman-ipucu").textContent;
  b.ctx(klipK, { hasSeq: true, sequenceId: "seq-1", seqIn: 10, seqOut: 15.1, seqDur: 60, frame: 0.04 });
  ok("bölüm sekanssız açıldı → sekans açıldı: ipucu güncellendi, katman sorulmadı",
    bIlk === "Katmanları görmek için bir sekans aç." && b.el("cut-katman-ipucu").textContent === IPUCU && b.cagrilar("KS_getTrackLayout").length === 0,
    bIlk + " / " + b.el("cut-katman-ipucu").textContent);
  await b.tikla("cut-analyze");
  await b.tikla("cut-apply");
  var ba = b.cagrilar("KS_applyCuts");
  ok("…Sessizlikleri bul katmanları okudu, Uygula Müzik'i korur", b.cagrilar("KS_getTrackLayout").length === 1 && ba.length === 1 &&
    JSON.stringify(ba[0].payload.protect) === JSON.stringify({ video: [], audio: [1] }), JSON.stringify(ba.length && ba[0].payload));

  /* b) Host katman düzeni değişti (kod katman): Türkçe açıklama, hak düşmez, düzen yeniden okunur, seçimler öneriye döner */
  var duzenNo = 0;
  var c = sahtePanel(K, stereo, {
    duzen: function () { return ++duzenNo <= 2 ? duzenYap() : muzikKaydi("seq-1"); },
    uygula: function () { return { ok: false, kod: "katman", error: "Katman duzeni degisti; kesimler uygulanmadi. Katmanlari yeniden oku." }; } });
  c.kapsam("entire");
  await c.bekle(20);
  await c.tikla("cut-analyze");
  c.el("cut-koru-izler").children[2].onclick();   // A1'i de koru (kullanıcı seçimi: dizin listesi)
  await c.tikla("cut-apply");
  await c.bekle(20);
  var ca = c.cagrilar("KS_applyCuts");
  ok("katman düzeni değişti: '✕ Katman düzeni değişti…', hak düşmedi, sonuç duruyor",
    ca.length === 1 && JSON.stringify(ca[0].payload.expectTracks) === JSON.stringify({ video: ["Video 1", "Video 2"], audio: ["Audio 1", "Müzik"] }) &&
    /^✕ Katman düzeni değişti/.test(c.el("cut-status").textContent) && c.kayit.harca.length === 0 && c.el("cut-result").hidden === false,
    c.el("cut-status").textContent);
  ok("…katmanlar yeniden okundu; dizin seçimleri yeni düzene taşınmadı (öneri: Müzik artık A3)",
    c.cagrilar("KS_getTrackLayout").length === 3 && JSON.stringify(cipler(c, "cut-koru-izler")) === JSON.stringify(["V1", "V2", "A1", "A2", "A3 · Müzik+"]),
    JSON.stringify(cipler(c, "cut-koru-izler")));

  /* c) Uyarılar: korunan katman değişti (kopya / bu sekans), korunan katman bulunamadı */
  var d = sahtePanel(K, stereo, { duzen: function () { return duzenYap(); },
    uygula: function () { return { ok: true, newSeq: "Vlog - kopya", removed: 4, selected: 0, rippleFallback: false, protectedSkipped: { video: 0, audio: 1 }, protectedChanged: true }; } });
  d.kapsam("entire");
  await d.bekle(20);
  await d.tikla("cut-analyze");
  await d.tikla("cut-apply");
  ok("protectedChanged + kopya: özgün sekans sağlam denir, tek Ctrl+Z vaadi yok",
    /Özgün sekans değişmedi/.test(d.el("cut-status").textContent) && !/Ctrl\+Z/.test(d.el("cut-status").textContent), d.el("cut-status").textContent);
  var e = sahtePanel(K, stereo, { duzen: function () { return duzenYap(); },
    uygula: function () { return { ok: true, newSeq: "", removed: 4, selected: 0, rippleFallback: false, protectedSkipped: { video: 0, audio: 1 }, protectedChanged: true }; } });
  e.hedef("here");
  e.el("cut-mode").value = "ripple";
  e.kapsam("entire");
  await e.bekle(20);
  await e.tikla("cut-analyze");
  await e.tikla("cut-apply");
  ok("protectedChanged + Bu sekansta: geri almanın tek adım olmadığı ve Geçmiş paneli söylenir",
    e.cagrilar("KS_applyCuts").length === 1 && e.cagrilar("KS_applyCuts")[0].payload.cloneFirst === false &&
    /tek Ctrl\+Z \(Mac: Cmd\+Z\) geri getirmez/.test(e.el("cut-status").textContent) && /Geçmiş \(History\)/.test(e.el("cut-status").textContent), e.el("cut-status").textContent);
  var f = sahtePanel(K, stereo, { duzen: function () { return duzenYap(); },
    uygula: function () { return { ok: true, newSeq: "Vlog - kopya", removed: 4, selected: 0, rippleFallback: false, protectedSkipped: { video: 0, audio: 0 } }; } });
  f.kapsam("entire");
  await f.bekle(20);
  await f.tikla("cut-analyze");
  await f.tikla("cut-apply");
  ok("host korunan katmanı saymadı (protectedSkipped 0): toast 'korunan: A2' demez, uyarı",
    !f.kayit.toast.some(function (t) { return /korunan:/.test(t[0]); }) && /Korunan katmanlardan bazıları sekansta bulunamadı/.test(f.el("cut-status").textContent),
    JSON.stringify(f.kayit.toast) + " " + f.el("cut-status").textContent);

  /* d) Sekans kimliği Premiere'den: tıklama anındaki bağlam bayat (seq-X), Premiere seq-Y'de */
  var g;
  var gNo = 0;
  g = sahtePanel(K, stereo, { ctx: { hasSeq: true, sequenceId: "seq-X", seqIn: 10, seqOut: 15.1, seqDur: 60, frame: 0.04 },
    duzen: function () {
      // ikinci okumadan (analiz) hemen önce bekleyen bağlam yoklaması seq-Y'yi getirdi
      if (++gNo === 2) g.ctx(null, { sequenceId: "seq-Y" });
      return duzenYap({ seqId: "seq-Y" });
    },
    disaSeqId: function () { return "seq-Y"; } });
  g.kapsam("entire");
  await g.bekle(20);
  await g.tikla("cut-analyze");
  await g.tikla("cut-apply");
  var ga = g.cagrilar("KS_applyCuts");
  ok("analiz edilen sekans Premiere'in söylediği (seq-Y), tıklama anındaki bayat bağlam (seq-X) değil",
    ga.length === 1 && ga[0].payload.expectSeqId === "seq-Y", JSON.stringify(ga.length && ga[0].payload.expectSeqId) + " " + g.el("cut-status").textContent);
  var h = sahtePanel(K, stereo, { duzen: function () { return duzenYap({ seqId: "seq-1" }); }, disaSeqId: function () { return "seq-2"; } });
  h.kapsam("entire");
  await h.bekle(20);
  await h.tikla("cut-analyze");
  ok("katmanlar seq-1'den, ses seq-2'den: analiz durur, sonuç yok, WAV silindi",
    /^✕ etkin sekans analiz sırasında değişti/.test(h.el("cut-status").textContent) && h.el("cut-result").hidden === true && h.wavlar.length === 1 && !fs.existsSync(h.wavlar[0]) &&
    h.kayit.runAkis.length === 0, h.el("cut-status").textContent);

  /* e) Windows: karışım WAV'ı hâlâ açık (EBUSY): yol unutulmaz, yeniden denenir */
  var kilitli = {};
  var sahteFs = {};
  for (var k in fs) sahteFs[k] = fs[k];
  sahteFs.unlinkSync = function (yol) {
    if (kilitli[yol] > 0) {
      kilitli[yol]--;
      var hata = new Error("EBUSY: resource busy or locked, unlink '" + yol + "'");
      hata.code = "EBUSY";
      throw hata;
    }
    return fs.unlinkSync(yol);
  };
  var w = sahtePanel(K, stereo, { fs: sahteFs, duzen: function () { return duzenYap(); }, disaAktarildi: function (yol) { kilitli[yol] = 2; } });
  w.kapsam("entire");
  await w.bekle(20);
  await w.tikla("cut-analyze");
  w.kapsam("clip");   // sonuç bırakılır, WAV silinmeye çalışılır (ffmpeg / Dinle hâlâ tutuyor)
  await w.bekle(200);
  var hemen = fs.existsSync(w.wavlar[0]);
  await w.bekle(1900);
  ok("silinemeyen karışım WAV'ı (EBUSY ×2) artan aralıklarla yeniden denendi ve silindi",
    hemen === true && !fs.existsSync(w.wavlar[0]) && kilitli[w.wavlar[0]] === 0, "hemen=" + hemen + " sonra=" + fs.existsSync(w.wavlar[0]));

  await korumaSekansDegisimi(K, stereo, klipK);
  await bayatInOut(K, stereo);
}

/*
 * ---- 3.4 adım 7 incelemesi (2): sekans değişince korunan katmanlar düşmez ----
 * Kopya sekansta Uygula kopyayı etkin yapar: bağlam yeni sekansı getirince düzen (katman) düşer. Seçimler eskiden onunla
 * birlikte siliniyordu: klip kapsamında Katmanlar kapalıyken ikinci geçişte düzen hiç okunmuyor, sekans kapsamlarında
 * elle korunan katman öneriye dönüyordu; ikisinde de protect gitmiyor, korunan müzik kesilip kayıyordu.
 */
async function korumaSekansDegisimi(K, stereo, klipK) {
  var seqNow = "seq-1";
  function kopyaYap(yuk) {
    seqNow = seqNow + "-kopya";
    return { ok: true, newSeq: "Vlog - kopya", removed: 4, selected: 0, rippleFallback: false,
      protectedSkipped: yuk.protect ? { video: yuk.protect.video.length, audio: yuk.protect.audio.length } : undefined };
  }
  // Müzik "Audio 2" adlı (yalnız önerilir, varsayılan korunmaz): kullanıcı elle korur
  function adsizMuzik() { var d = duzenYap({ seqId: seqNow }); d.audio[1].name = "Audio 2"; return d; }

  /* a) Seçili klip, Katmanlar açılıp kapatıldı: kopyada seçilen klibin ikinci geçişi de Müzik'i korur */
  var a = sahtePanel(K, stereo, { clip: klipK, duzen: function () { return duzenYap({ seqId: seqNow }); }, uygula: kopyaYap });
  a.el("cut-katman").open = true;
  a.el("cut-katman").fire("toggle");
  await a.bekle(20);
  a.el("cut-katman").open = false;
  a.el("cut-katman").fire("toggle");
  await a.tikla("cut-analyze");
  await a.tikla("cut-apply");
  var a1 = a.cagrilar("KS_applyCuts");
  ok("koruma + sekans değişimi (klip): ilk geçiş Müzik'i korur", a1.length === 1 && JSON.stringify(a1[0].payload.protect) === JSON.stringify({ video: [], audio: [1] }),
    JSON.stringify(a1.length && a1[0].payload.protect));
  // Premiere artık kopyayı gösteriyor; kullanıcı kopyada bir klip seçer (Katmanlar bölümü kapalı)
  a.ctx({ mediaPath: stereo, inPoint: 0, outPoint: 5.1, clipStart: 30, clipEnd: 35.1 }, { sequenceId: seqNow });
  await a.bekle(560);
  await a.tikla("cut-analyze");
  await a.tikla("cut-apply");
  var a2 = a.cagrilar("KS_applyCuts"), al = a.cagrilar("KS_getTrackLayout");
  ok("…kopyada ikinci geçiş: bölüm kapalı olsa da düzen kopyadan yeniden okundu, protect A2 + expectTracks gider, toast 'korunan: A2'",
    a2.length === 2 && al.length === 3 && al[2].payload.start === 30 && JSON.stringify(a2[1].payload.protect) === JSON.stringify({ video: [], audio: [1] }) &&
    a2[1].payload.expectSeqId === "seq-1-kopya" && JSON.stringify(a2[1].payload.expectTracks) === JSON.stringify({ video: ["Video 1", "Video 2"], audio: ["Audio 1", "Müzik"] }) &&
    /korunan: A2/.test(a.kayit.toast[a.kayit.toast.length - 1][0]),
    JSON.stringify(a2.length > 1 && a2[1].payload.protect) + " okuma=" + al.length + " " + JSON.stringify(a.kayit.toast));

  /* b) Sekans kapsamı, elle korunan adsız müzik (A2): kopyadaki ikinci geçiş de korur */
  seqNow = "seq-1";
  var b = sahtePanel(K, stereo, { duzen: adsizMuzik, uygula: kopyaYap, disaSeqId: function () { return seqNow; } });
  b.kapsam("entire");
  await b.bekle(20);
  ok("adsız müzik A2 yalnız önerilir (işaretsiz)", JSON.stringify(cipler(b, "cut-koru-izler")) === JSON.stringify(["V1", "V2", "A1", "A2~"]), JSON.stringify(cipler(b, "cut-koru-izler")));
  b.el("cut-koru-izler").children[3].onclick();   // kullanıcı A2'yi korur
  await b.tikla("cut-analyze");
  await b.tikla("cut-apply");
  b.ctx(null, { sequenceId: seqNow });          // Premiere kopyayı gösteriyor
  await b.bekle(560);
  await b.tikla("cut-analyze");
  await b.tikla("cut-apply");
  var ba = b.cagrilar("KS_applyCuts");
  ok("koruma + sekans değişimi (Sekans): elle korunan A2 kopyadaki ikinci geçişte de korunur",
    ba.length === 2 && JSON.stringify(ba[0].payload.protect) === JSON.stringify({ video: [], audio: [1] }) &&
    JSON.stringify(ba[1].payload.protect) === JSON.stringify({ video: [], audio: [1] }) && ba[1].payload.expectSeqId === "seq-1-kopya" &&
    JSON.stringify(cipler(b, "cut-koru-izler")) === JSON.stringify(["V1", "V2", "A1", "A2+"]),
    JSON.stringify(ba.map(function (x) { return x.payload.protect; })) + " " + JSON.stringify(cipler(b, "cut-koru-izler")));

  /* c) Başka düzende (imza farklı: katman eklendi) bir sekansa geçildi: dizin seçimleri taşınmaz, öneriye döner */
  var cNo = 0;
  var c = sahtePanel(K, stereo, { disaSeqId: function () { return "seq-2"; }, duzen: function () {
    if (++cNo > 1) return muzikKaydi("seq-2");
    var x = duzenYap({ seqId: "seq-1" });
    x.audio[1].name = "Audio 2";
    return x;
  } });
  c.kapsam("entire");
  await c.bekle(20);
  c.el("cut-koru-izler").children[3].onclick();   // A2'yi (adsız müzik) korur
  c.ctx(null, { sequenceId: "seq-2" });
  await c.bekle(10);
  await c.tikla("cut-analyze");
  await c.tikla("cut-apply");
  var ca = c.cagrilar("KS_applyCuts");
  ok("farklı katman düzenli sekans: elle seçilen A2 dizini taşınmaz (seq-2'de A2 boş katman), öneri: Müzik A3",
    ca.length === 1 && JSON.stringify(ca[0].payload.protect) === JSON.stringify({ video: [], audio: [2] }) && ca[0].payload.expectSeqId === "seq-2",
    JSON.stringify(ca.length && ca[0].payload.protect));

  /* d) Düzen okunamıyor (Premiere meşgul): son düzende korunan katman varsa Uygula korumasız gitmez */
  var dNo = 0, seqD = "seq-1";
  var d = sahtePanel(K, stereo, { clip: klipK, duzen: function () {
    dNo++;
    if (dNo === 2 || dNo === 3) return { ok: false, error: "Premiere mesgul" };
    return duzenYap({ seqId: seqD });
  } });
  d.el("cut-katman").open = true;
  d.el("cut-katman").fire("toggle");
  await d.bekle(20);
  d.el("cut-katman").open = false;
  d.el("cut-katman").fire("toggle");
  seqD = "seq-2";
  d.ctx({ mediaPath: stereo, inPoint: 0, outPoint: 5.1, clipStart: 20, clipEnd: 25.1 }, { sequenceId: "seq-2" });
  await d.bekle(10);
  await d.tikla("cut-analyze");                 // 2. okuma başarısız: analiz yine sürer
  await d.tikla("cut-apply");                   // 3. okuma (Uygula'da) başarısız: uygulanmaz
  ok("düzen düştü ve okunamadı: Uygula korumasız göndermez, uyarı, hak düşmez",
    d.cagrilar("KS_getTrackLayout").length === 3 && d.cagrilar("KS_applyCuts").length === 0 && d.kayit.harca.length === 0 &&
    /Katmanlar okunamadı: korunan katmanlar bilinmeden kesim uygulanmaz/.test(d.el("cut-status").textContent) && d.el("cut-result").hidden === false,
    d.el("cut-status").textContent);
  await d.tikla("cut-apply");                   // 4. okuma başarılı: koruyarak uygular
  var da = d.cagrilar("KS_applyCuts");
  ok("…sonraki Uygula düzeni okur ve Müzik'i koruyarak uygular", da.length === 1 && JSON.stringify(da[0].payload.protect) === JSON.stringify({ video: [], audio: [1] }) &&
    da[0].payload.expectSeqId === "seq-2", JSON.stringify(da.length && da[0].payload));
}

/*
 * ---- 3.4 adım 7 incelemesi (3): In → Out / Sekans aralığı bayat bağlamdan alınmaz ----
 * KS_getContext yalnız panel odaktayken yoklanır: Premiere'de I / O'ya basıp hemen Sessizlikleri bul'a tıklayınca
 * KApp.ctx() eski In / Out'u taşır. Aralık katman okumasıyla aynı anda Premiere'den alınır (scope → kapsam).
 */
async function bayatInOut(K, stereo) {
  var beklenen = S.kesimlereCevir(silencedetect(stereo, -38, 0.8, 0, 5.1), { pay: 0.15, sure: 5.1 }).kesimler;

  /* a) Bağlamda In / Out yok (0 – sekans sonu), Premiere'de az önce I / O ile 10–15.1 işaretlendi */
  var a = kapsamPaneli(K, stereo, { seqIn: 0, seqOut: 60, hostIn: 10, hostOut: 15.1 });
  a.kapsam("inout");
  await a.bekle(20);
  await a.tikla("cut-analyze");
  var aex = a.cagrilar("KS_exportAudio");
  ok("bayat bağlam (In / Out yok) ama Premiere'de In / Out var: uyarı yok, In → Out dışa aktarılır, kesimler In 10'dan",
    !/In \/ Out yok/.test(a.el("cut-status").textContent) && aex.length === 1 && aex[0].payload.scope === "inout" && /^2 kesim/.test(a.el("cut-summary").textContent),
    a.el("cut-status").textContent + " / " + a.el("cut-summary").textContent);
  await a.tikla("cut-apply");
  var aa = a.cagrilar("KS_applyCuts");
  ok("…Uygula'da kesimler sekans zamanında (ofset 10)", aa.length === 1 && Math.abs(aa[0].payload.ranges[0].start - (10 + beklenen[0].start)) < 1e-6,
    JSON.stringify(aa.length && aa[0].payload.ranges));

  /* b) Bağlamda In / Out var, Premiere'de kaldırıldı (Ctrl+Shift+X): bayat aralıkla dışa aktarılmaz */
  var b = kapsamPaneli(K, stereo, { seqIn: 10, seqOut: 15.1, hostIn: 0, hostOut: 60 });
  b.kapsam("inout");
  await b.bekle(20);
  await b.tikla("cut-analyze");
  ok("bayat bağlam (In / Out var) ama Premiere'de yok: 'In / Out yok' uyarısı, dışa aktarım yok",
    /Sekansta In \/ Out yok/.test(b.el("cut-status").textContent) && b.cagrilar("KS_exportAudio").length === 0, b.el("cut-status").textContent);

  /*
   * c) Yanlış karışım: bağlam eski In / Out'u (10–20, A1'de konuşmacı A) taşıyor, Premiere'de In / Out 100–105.1 (A2'de
   * konuşmacı B). Varsayılan Dinlenecek ses yeni aralıktan: A2 (eski aralıkla A1 seçilir, karışım tümüyle sessiz çıkardı).
   */
  function ikiKonusmaci() {
    function iz(i, ad, kl) { return { index: i, name: ad, locked: false, muted: false, clipCount: kl.length, first: kl[0].s, last: kl[kl.length - 1].e, klipler: kl }; }
    return { ok: true, seqId: "seq-1", name: "Röportaj", duration: 300,
      video: [iz(0, "Video 1", [{ s: 0, e: 30, yol: "a.mp4", hiza: 0 }, { s: 90, e: 200, yol: "b.mp4", hiza: -90 }])],
      audio: [iz(0, "Audio 1", [{ s: 0, e: 30, yol: "a.mp4", hiza: 0, bag: [{ s: 0, e: 30, tur: "Video" }] }]),
        iz(1, "Audio 2", [{ s: 90, e: 200, yol: "b.mp4", hiza: -90, bag: [{ s: 90, e: 200, tur: "Video" }] }])] };
  }
  var c = sahtePanel(K, stereo, { duzen: ikiKonusmaci, hostIn: 100, hostOut: 105.1, hostDur: 300,
    ctx: { hasSeq: true, sequenceId: "seq-1", seqIn: 10, seqOut: 20, seqDur: 300, frame: 0.04 } });
  c.kapsam("inout");
  await c.bekle(20);
  await c.tikla("cut-analyze");
  var cex = c.cagrilar("KS_exportAudio");
  ok("bayat bağlam (In / Out 10–20): Dinlenecek ses Premiere'in In / Out'undan (100–105.1): A2 dışa aktarılır, A1 değil",
    cex.length === 1 && JSON.stringify(cex[0].payload.tracks) === "[1]" && JSON.stringify(cipler(c, "cut-dinle-izler")) === JSON.stringify(["A1", "A2+"]),
    JSON.stringify(cex.length && cex[0].payload.tracks) + " " + JSON.stringify(cipler(c, "cut-dinle-izler")));
  var satir0 = c.el("cut-ranges").children.length ? c.el("cut-ranges").children[0].children[1].textContent : "";
  ok("…kesimler In 100'den (sekans zamanı)", /^1:4\d\.\d$/.test(satir0), satir0);

  /* d) In / Out katmanlar okunduktan sonra, dışa aktarımdan önce taşındı: karışım okunan aralığın değil, analiz durur */
  var dIn = 10;
  var d = kapsamPaneli(K, stereo, { disaKapsam: function () { return { scope: "inout", seqIn: dIn, seqOut: 15.1, seqDur: 60, frame: 0.04 }; } });
  d.kapsam("inout");
  await d.bekle(20);
  dIn = 12;
  await d.tikla("cut-analyze");
  ok("dışa aktarılan In / Out okunandan farklı: '✕ In / Out analiz sırasında değişti', sonuç yok, WAV silindi, ffmpeg çalışmadı",
    /^✕ In \/ Out analiz sırasında değişti/.test(d.el("cut-status").textContent) && d.el("cut-result").hidden === true && d.wavlar.length === 1 &&
    !fs.existsSync(d.wavlar[0]) && d.kayit.runAkis.length === 0, d.el("cut-status").textContent);

  /* e) In → Out'tan hemen Sekans'a geçildi (ilk okuma sürerken): Sekans analizi Sekans düzeniyle, In / Out aralığıyla değil */
  var e = kapsamPaneli(K, stereo);
  e.kapsam("inout");
  e.kapsam("entire");
  await e.bekle(20);
  var el2 = e.cagrilar("KS_getTrackLayout");
  await e.tikla("cut-analyze");
  var el3 = e.cagrilar("KS_getTrackLayout");
  // analiz her seferinde taze okur (3.): o da Sekans kapsamıyla
  ok("kapsam okuma sürerken değişti: Sekans için yeniden okundu, Sekans dışa aktarıldı, analiz Sekans aralığında",
    el2.length === 2 && el2[0].payload.scope === "inout" && el2[1].payload.scope === "entire" && el3.length === 3 && el3[2].payload.scope === "entire" &&
    e.cagrilar("KS_exportAudio").length === 1 && e.cagrilar("KS_exportAudio")[0].payload.scope === "entire" && /^2 kesim/.test(e.el("cut-summary").textContent),
    JSON.stringify(e.cagrilar("KS_getTrackLayout").map(function (x) { return x.payload; })) + " " + e.el("cut-status").textContent);
}

/*
 * ---- Örnekleme hızı: zarf silencedetect'le AYNI hızda ölçer ----
 * Tıslamalı kayıt (48 kHz mono, -12 dBFS ton patlamaları arasında 1.5 sn duraksama + Gauss beyaz gürültü).
 * Zarf 16 kHz'e indirilince gürültü tabanı silencedetect'in gördüğünden ~6 dB alçak ölçülüyordu: Otomatik
 * eşiği sessizlik bulunmayan yere koyuyor, önizleme 2 kesim gösterip doğrulama 0 buluyor, Uygula hiçbir şey
 * kesmiyordu ("Doğrulamadan sonra uygulanacak kesim kalmadı"). σ 0.003'te varsayılan -38 dB'de de önizleme
 * 2 kesim gösterirken silencedetect (3.3) hiç bulmuyordu.
 */
function sdSuzgecli(dosya, esik, d, inPoint, dur) {
  return parseSilence(cp.spawnSync(FF, ["-hide_banner", "-ss", String(inPoint), "-t", String(dur), "-i", dosya, "-map", "0:a:0?",
    "-af", S.ZAMAN_SUZGECI + ",silencedetect=noise=" + esik + "dB:d=" + d, "-f", "null", "-"], { encoding: "utf8", timeout: 60000 }).stderr || "");
}
async function ornekHiziTestleri(K) {
  var seviyeler = [[0.0003, "sessiz oda"], [0.001, "hafif tıslama"], [0.003, "belirgin tıslama"]];
  for (var i = 0; i < seviyeler.length; i++) {
    var sigma = seviyeler[i][0], ad = "tıslama σ " + sigma + " (" + seviyeler[i][1] + ")";
    var wav = pathm.join(TMP, "tislama-" + i + ".wav");
    // ton 0–1, 2.5–3.5, 5–6 sn; aralar yalnız gürültü. Gauss: Box-Muller (ffmpeg random() tohumlu → her koşuda aynı)
    var ifade = "0.25*sin(2*PI*300*t)*between(t\\,0\\,1)+0.25*sin(2*PI*500*t)*between(t\\,2.5\\,3.5)+0.25*sin(2*PI*700*t)*between(t\\,5\\,6)+" +
      sigma + "*sqrt(-2*log(random(0)+1e-12))*cos(2*PI*random(1))";
    var u = cp.spawnSync(FF, ["-hide_banner", "-y", "-f", "lavfi", "-i", "aevalsrc=" + ifade + ":s=48000:d=6", "-c:a", "pcm_s16le", wav], { encoding: "utf8", timeout: 60000 });
    if (u.status !== 0) { ok(ad + ": wav üretildi", false, String(u.stderr).slice(-200)); return; }
    var p = kabi.kesimPaneli({ K: K, ffmpeg: FF, clip: { mediaPath: wav, inPoint: 0, outPoint: 6, clipStart: 0, clipEnd: 6 } });
    await p.tikla("cut-analyze");
    var varsayilan = (p.el("cut-summary").textContent.match(/^(\d+) kesim/) || [])[1];
    var sd38 = S.kesimlereCevir(sdSuzgecli(wav, -38, 0.8, 0, 6), { pay: 0.15, minKesim: 0.25, kenar: 0.05, sure: 6 }).kesimler.length;
    ok(ad + ": varsayılan -38 dB'de önizleme = silencedetect (" + sd38 + " kesim)", varsayilan === String(sd38), p.el("cut-summary").textContent + " vs silencedetect " + sd38);
    p.tikla("cut-noise-auto");
    var esik = p.el("cut-noise").value, onizleme = (p.el("cut-summary").textContent.match(/^(\d+) kesim/) || [])[1];
    var sdOto = sdSuzgecli(wav, esik, 0.8, 0, 6).length;
    ok(ad + ": Otomatik eşik (" + esik + " dB) duraksamaları bulur ve silencedetect aynı eşikte aynısını bulur",
      onizleme === "2" && sdOto === 2, "önizleme " + onizleme + " / silencedetect " + sdOto + " · " + p.el("cut-status").textContent);
    await p.tikla("cut-apply");
    var cagri = p.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; });
    ok(ad + ": Otomatik sonrası Uygula önizlenen 2 kesimi tek tıkla uygular (doğrulama atmaz, fark uyarısı yok)",
      cagri.length === 1 && cagri[0].payload.ranges.length === 2 && !/kalmadı|Doğrulama kesimleri değiştirdi/.test(p.el("cut-status").textContent),
      cagri.length + " çağrı · " + p.el("cut-status").textContent);
  }

  // 22.05 kHz: pencere 220,5 örnek. Zarf ekseni 60 sn sonra da silencedetect'le ±50 ms (sabit 221 örnekle ~136 ms kayardı)
  var w22 = pathm.join(TMP, "oran22050.wav");
  var u22 = cp.spawnSync(FF, ["-hide_banner", "-y", "-f", "lavfi", "-i", "aevalsrc=0.25*sin(2*PI*400*t)*(1-between(t\\,60\\,61.5)):s=22050:d=63",
    "-c:a", "pcm_s16le", w22], { encoding: "utf8", timeout: 60000 });
  if (u22.status !== 0) { ok("22.05 kHz wav üretildi", false, String(u22.stderr).slice(-200)); return; }
  var c = await cozumle(K, w22, 0, 63);
  var z = S.sessizAraliklar(c.zarf, { esik: -30, minSessizlik: 0.8, sure: 63 });
  var sd = sdSuzgecli(w22, -30, 0.8, 0, 63);
  ok("22.05 kHz: hız okundu, 63 sn → ~6300 pencere, 60 sn'deki duraksama silencedetect ile ±50 ms (eksen kaymaz)",
    c.sr === 22050 && Math.abs(c.zarf.length - 6300) <= 2 && sd.length === 1 && yakinListe(z, sd, 0.05), c.sr + " Hz, " + c.zarf.length + " · " + yaz(z) + " vs " + yaz(sd));
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
  // Premiere'de klip kaydırıldı (slip): medya ve klipStart aynı, in/out farklı → app.js onContext'e haber vermez; panel
  // henüz yoklamadan Sessizlikleri bul (sessiz: analyze kendi sıfırlar)
  p.ctx({ mediaPath: stereo, inPoint: 1.0, outPoint: 4.5, clipStart: 10, clipEnd: 13.5 }, null, true);
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

  await kilitTestleri(K1);
  await altyaziTestleri(K1);
  await incelemeR2Testleri(K1);
  await tasinanKlipTestleri(K1);
}

/*
 * ---- 3.4 inceleme r2: konum değişince kararlar, önbellekten analizde eski hata, yedek akışta Otomatik, Otomatik'in
 * bayat satırı, hiçbir şey kesilmeyen Uygula (hak), protect'siz çağrıda 3.3 ripple kuralı, boş sekans / sessiz aralık ----
 */
async function incelemeR2Testleri(K1) {
  var pcm = pcmMono([[1.0, 1], [1.5, 0], [1.0, 1], [1.5, 0], [1.0, 1]]);   // 6 sn; sessizlik 1.0–2.5 ve 3.5–5.0
  var K6 = {};
  for (var k in K1) K6[k] = K1[k];
  K6.runAkis = function (cmd, args, opts) {
    opts.onStderr(CIKIS);
    opts.onData(pcm);
    return Promise.resolve({ code: 0, stderr: CIKIS, bayt: pcm.length });
  };
  K6.run = function () { return Promise.resolve({ code: 0, stderr: sdCiktisi([[1.0, 2.5], [3.5, 5.0]]) }); };
  function uygulamalar(p) { return p.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; }); }

  /* a) Aynı klip sekansta başka konumda (bağlam yoklaması haber vermez): kararlar eski konumdaki kesime oturmaz */
  var klipA = { mediaPath: "/sahte/konum.mp4", inPoint: 0, outPoint: 6, clipStart: 30, clipEnd: 36 };
  var a = kabi.kesimPaneli({ K: K6, ffmpeg: "ffmpeg", clip: klipA });
  await a.tikla("cut-analyze");
  var cb = a.el("cut-ranges").children[1].children[0];
  cb.checked = false; cb.onchange();   // 2. kesimi (33.65–34.85) kapat
  ok("konum: analiz 2 kesim, 2. kesim kapatıldı", /^1 kesim/.test(a.el("cut-summary").textContent), a.el("cut-summary").textContent);
  var klipB = { mediaPath: "/sahte/konum.mp4", inPoint: 0, outPoint: 6, clipStart: 32.5, clipEnd: 38.5 };
  a.ctx(klipB, null, true);
  await a.bekle(560);   // "Sessizlikleri bul" yeniden göründükten sonraki çift tık koruması
  await a.tikla("cut-analyze");
  var acik = a.el("cut-ranges").children.map(function (row) { return row.children[0].checked; });
  ok("konum değişti (klip 30 → 32.5 sn, aynı medya / in / süre): önceki kararlar taşınmaz, iki kesim de açık, ffmpeg yeniden çalışmaz",
    JSON.stringify(acik) === "[true,true]" && /^2 kesim/.test(a.el("cut-summary").textContent) && a.kayit.runAkis.length === 1,
    JSON.stringify(acik) + " " + a.el("cut-summary").textContent + " runAkis=" + a.kayit.runAkis.length);
  await a.tikla("cut-apply");
  var aa = uygulamalar(a);
  ok("…Uygula yeni konumdaki iki kesimi gönderir (kapatılan duraksama kaymış haliyle kesilmez, ilki atlanmaz); seçili klipte esitKayma yok",
    aa.length === 1 && aa[0].payload.ranges.length === 2 && Math.abs(aa[0].payload.ranges[0].start - 33.65) < 1e-6 && Math.abs(aa[0].payload.ranges[1].start - 36.15) < 1e-6 &&
    aa[0].payload.esitKayma === undefined,
    JSON.stringify(aa.length && aa[0].payload));
  // aynı konumda yeniden analiz: kararlar korunur (eski davranış)
  var a2 = kabi.kesimPaneli({ K: K6, ffmpeg: "ffmpeg", clip: klipA });
  await a2.tikla("cut-analyze");
  var cb2 = a2.el("cut-ranges").children[1].children[0];
  cb2.checked = false; cb2.onchange();
  await a2.bekle(560);
  await a2.tikla("cut-analyze");
  ok("aynı konumda yeniden analiz: kapatılan kesim kapalı kalır", JSON.stringify(a2.el("cut-ranges").children.map(function (row) { return row.children[0].checked; })) === "[true,false]",
    a2.el("cut-summary").textContent);

  /* b) Başarısız Uygula'nın hatası önbellekten gelen başarılı analizde kalmaz */
  var b = kabi.kesimPaneli({ K: K6, ffmpeg: "ffmpeg", clip: klipA, applyCuts: function () { return { ok: false, error: "Katman kilitli: V1." }; } });
  await b.tikla("cut-analyze");
  await b.tikla("cut-apply");
  ok("Uygula hatası durum satırında ('✕ Katman kilitli: V1.')", b.el("cut-status").textContent === "✕ Katman kilitli: V1." && /bad/.test(b.el("cut-status").className),
    b.el("cut-status").textContent);
  await b.bekle(560);
  await b.tikla("cut-analyze");
  ok("aynı klipte yeniden Sessizlikleri bul (önbellek, ffmpeg yok): harita döner, eski hata silinir",
    b.el("cut-status").textContent === "" && !/bad|warn/.test(b.el("cut-status").className) && /^2 kesim/.test(b.el("cut-summary").textContent) && b.kayit.runAkis.length === 1,
    JSON.stringify([b.el("cut-status").textContent, b.el("cut-status").className, b.kayit.runAkis.length]));

  /* c) Yedek akış (ses çözümlenemedi, silencedetect haritası): Otomatik "önce bul" diye çıkmaz sokağa göndermez */
  var Kc = {};
  for (var kc in K6) Kc[kc] = K6[kc];
  Kc.runAkis = function () { return Promise.resolve({ code: 1, stderr: "Invalid data", bayt: 0 }); };
  var c = kabi.kesimPaneli({ K: Kc, ffmpeg: "ffmpeg", clip: klipA });
  c.tikla("cut-noise-auto");
  ok("analizden önce Otomatik: 'Önce Sessizlikleri bul' (değişmedi)", /^Önce Sessizlikleri bul/.test(c.el("cut-status").textContent), c.el("cut-status").textContent);
  await c.tikla("cut-analyze");
  ok("yedek akış: silencedetect haritası (2 kesim)", /^2 kesim/.test(c.el("cut-summary").textContent) && c.kayit.run.length === 1, c.el("cut-summary").textContent);
  c.tikla("cut-noise-auto");
  ok("yedek akışta Otomatik: 'Otomatik eşik bu klipte kullanılamıyor … elle ayarla' (yeniden bulmak yine çözemez)",
    c.el("cut-status").textContent === "Otomatik eşik bu klipte kullanılamıyor: ses çözümlenemedi. Eşiği elle ayarla, sonra Sessizlikleri bul." &&
    /warn/.test(c.el("cut-status").className), c.el("cut-status").textContent);

  /* d) Otomatik'in satırı Eşik elle değişince silinir (kaydırıcıyla çelişmesin); başka kaydırıcı silmez */
  var d = kabi.kesimPaneli({ K: K6, ffmpeg: "ffmpeg", clip: klipA });
  await d.tikla("cut-analyze");
  d.tikla("cut-noise-auto");
  var otoSatir = d.el("cut-status").textContent;
  ok("Otomatik: 'Otomatik eşik: -60 dB …' ve kaydırıcı -60", /^Otomatik eşik: -60 dB/.test(otoSatir) && d.el("cut-noise").value === "-60", otoSatir);
  d.kaydir("cut-pad", "0.1");
  await d.bekle(160);
  ok("Tampon değişti: Otomatik satırı kalır (eşik hâlâ önerilen)", d.el("cut-status").textContent === otoSatir, d.el("cut-status").textContent);
  d.kaydir("cut-noise", "-30");
  await d.bekle(160);
  ok("Eşik elle -30'a çekildi: 'Otomatik eşik: -60 dB' satırı silinir", d.el("cut-status").textContent === "" && /^2 kesim/.test(d.el("cut-summary").textContent),
    d.el("cut-status").textContent);

  /* e) KS_applyCuts hiçbir parça silmedi / seçmedi (kesimler yalnız boş bölgelerde): "uygulandı" yok, hak düşmez */
  var e = kabi.kesimPaneli({ K: K6, ffmpeg: "ffmpeg", clip: klipA,
    applyCuts: function () { return { ok: true, newSeq: "Vlog - kopya", removed: 0, selected: 0, rippleFallback: false, cuts: 4 }; } });
  await e.tikla("cut-analyze");
  var eToast = e.kayit.toast.length;
  await e.tikla("cut-apply");
  var eSonra = e.kayit.toast.slice(eToast);
  ok("removed 0 / selected 0: deneme hakkı düşmez, uyarı (kopya özgünüyle aynı), 'good' bildirim yok, harita kapanır",
    uygulamalar(e).length === 1 && e.kayit.harca.length === 0 &&
    e.el("cut-status").textContent === "⚠ Hiçbir klip kesilmedi: kesimler yalnız boş bölgelere (ya da kilitli katmanlara) denk geldi, açılan kopya sekans özgünüyle aynı." &&
    /warn/.test(e.el("cut-status").className) && eSonra.length === 1 && eSonra[0][1] === "warn" && e.el("cut-result").hidden === true,
    JSON.stringify([e.kayit.harca, e.el("cut-status").textContent, eSonra]));
  var e2 = kabi.kesimPaneli({ K: K6, ffmpeg: "ffmpeg", clip: klipA,
    applyCuts: function () { return { ok: true, newSeq: "Vlog - kopya", removed: 4, selected: 0, rippleFallback: false, cuts: 4 }; } });
  await e2.tikla("cut-analyze");
  await e2.tikla("cut-apply");
  ok("removed > 0: hak bir kez düşer, 'good' bildirim (eskisi gibi)", e2.kayit.harca.length === 1 && e2.kayit.toast.some(function (t) { return t[1] === "good"; }),
    JSON.stringify(e2.kayit.toast));

  /* f) Sekans kapsamında boş sekans ve sesi olmayan aralık: doğru yönlendirme */
  function sekansPaneli(duzen, seqDur) {
    return kabi.kesimPaneli({ K: K6, ffmpeg: "ffmpeg", clip: null,
      ctx: { hasSeq: true, sequenceId: "seq-1", seqIn: 0, seqOut: 0, seqDur: seqDur, frame: 0.04 },
      call: function (fn, yuk) {
        if (fn === "KS_getTrackLayout") {
          var dz = duzen();
          dz.kapsam = yuk && yuk.scope ? { scope: yuk.scope, seqIn: 0, seqOut: seqDur, seqDur: seqDur, frame: 0.04 } : undefined;
          return dz;
        }
        return { ok: false, error: "beklenmeyen " + fn };
      } });
  }
  var bosDuzen = function () { return { ok: true, seqId: "seq-1", name: "Boş", duration: 0, video: [], audio: [] }; };
  var f1 = sekansPaneli(bosDuzen, 0);
  f1.kapsam("entire");
  await f1.bekle(20);
  await f1.tikla("cut-analyze");
  ok("boş sekans (süre 0), Sekans kapsamı: 'Sekans boş: önce klip ekle.' ('Önce bir sekans aç.' değil), dışa aktarım yok",
    f1.el("cut-status").textContent === "Sekans boş: önce klip ekle." && f1.kayit.call.every(function (x) { return x.fn !== "KS_exportAudio"; }),
    f1.el("cut-status").textContent);
  var yalnizVideo = function () {
    return { ok: true, seqId: "seq-1", name: "Ekran", duration: 60,
      video: [{ index: 0, name: "Video 1", locked: false, muted: false, clipCount: 1, first: 0, last: 60, klipler: [{ s: 0, e: 60, ad: "ekran", yol: "ekran.mp4", hiza: 0 }] }],
      audio: [] };
  };
  var f2 = sekansPaneli(yalnizVideo, 60);
  f2.kapsam("entire");
  await f2.bekle(20);
  await f2.tikla("cut-analyze");
  ok("ses katmanı olmayan sekans (ekran kaydı): 'Bu aralıkta ses klibi yok …' (seçilecek çip yokken 'katman seç' denmez)",
    f2.el("cut-status").textContent === "Bu aralıkta ses klibi yok: sessizlik aranacak ses bulunamadı." && f2.kayit.call.every(function (x) { return x.fn !== "KS_exportAudio"; }),
    f2.el("cut-status").textContent);
  var bosSes = function () {
    var dz = yalnizVideo();
    dz.audio = [{ index: 0, name: "Audio 1", locked: false, muted: false, clipCount: 0, first: 0, last: 0, klipler: [] }];
    return dz;
  };
  var f3 = sekansPaneli(bosSes, 60);
  f3.kapsam("entire");
  await f3.bekle(20);
  await f3.tikla("cut-analyze");
  ok("ses katmanı var ama aralıkta klibi yok: yine 'Bu aralıkta ses klibi yok …'",
    f3.el("cut-status").textContent === "Bu aralıkta ses klibi yok: sessizlik aranacak ses bulunamadı.", f3.el("cut-status").textContent);
}

/*
 * ---- 3.4 inceleme r3: analizden sonra taşınan / kırpılan klip, yeniden analiz edilmeden Uygula ----
 * Kesimler sekans zamanında (analizdeki clipStart). app.js onContext aynı medyanın taşınmasını bildirmez, yoklama yalnız
 * panel odaktayken koşar: Uygula Premiere'e taze sorar (KS_getContext), onPoll analizi bırakır.
 */
async function tasinanKlipTestleri(K1) {
  var pcm = pcmMono([[1.0, 1], [1.5, 0], [1.0, 1], [1.5, 0], [1.0, 1]]);   // 6 sn; sessizlik 1.0–2.5 ve 3.5–5.0
  var KT = {};
  for (var k in K1) KT[k] = K1[k];
  KT.runAkis = function (cmd, args, opts) {
    opts.onStderr(CIKIS);
    opts.onData(pcm);
    return Promise.resolve({ code: 0, stderr: CIKIS, bayt: pcm.length });
  };
  KT.run = function () { return Promise.resolve({ code: 0, stderr: sdCiktisi([[1.0, 2.5], [3.5, 5.0]]) }); };
  function uygulamalar(p) { return p.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; }); }
  function cagrilar(p) { return p.kayit.call.map(function (x) { return x.fn; }).join(","); }
  function baslar(p, i) { var u = uygulamalar(p)[i]; return u ? u.payload.ranges.map(function (r) { return +r.start.toFixed(3); }) : null; }
  var UYGULA = "✕ Seçili klip analizden sonra değişti (taşındı, kırpıldı ya da başka klip seçildi): kesimler eski konuma düşerdi, uygulanmadı. Sessizlikleri yeniden bul.";
  var HARITA = "Seçili klip analizden sonra değişti (taşındı, kırpıldı ya da aynı dosyanın başka klibi seçildi): öneriler eski konumdaydı. Sessizlikleri yeniden bul.";
  var OKUNAMADI = "✕ Klibin yeri Premiere'den okunamadı: kesimler uygulanmadı. Yeniden Kesimleri uygula.";
  var klipA = { mediaPath: "/sahte/tasi.mp4", inPoint: 0, outPoint: 6, clipStart: 30, clipEnd: 36 };
  var klipB = { mediaPath: "/sahte/tasi.mp4", inPoint: 0, outPoint: 6, clipStart: 32.5, clipEnd: 38.5 };   // 2.5 sn sağa taşındı

  /* a) Taşındı, panel yoklamadı: KS_applyCuts eski konuma (31.15: öndeki klip; 33.65: konuşmanın ortası) gitmez, hak düşmez */
  var a = kabi.kesimPaneli({ K: KT, ffmpeg: "ffmpeg", clip: klipA });
  await a.tikla("cut-analyze");
  ok("taşıma: analiz 2 kesim (30 sn'deki klipte 31.15 ve 33.65)", /^2 kesim/.test(a.el("cut-summary").textContent), a.el("cut-summary").textContent);
  a.ctx(klipB, null, true);
  await a.tikla("cut-apply");
  ok("taşınan klip (30 → 32.5 sn, yoklama yok), Kesimleri uygula: Premiere'e taze sorulur, KS_applyCuts gönderilmez, deneme hakkı düşmez",
    cagrilar(a) === "KS_getContext" && uygulamalar(a).length === 0 && a.kayit.harca.length === 0, cagrilar(a) + " harca=" + a.kayit.harca.length);
  ok("…'✕ Seçili klip analizden sonra değişti …', eski konumdaki harita bırakılır, Kesimleri uygula kapanır",
    a.el("cut-status").textContent === UYGULA && /bad/.test(a.el("cut-status").className) && a.el("cut-result").hidden === true &&
    a.el("cut-apply").disabled === true && a.el("cut-ranges").children.length === 0 && a.el("cut-analyze").disabled === false,
    JSON.stringify([a.el("cut-status").textContent, a.el("cut-result").hidden, a.el("cut-apply").disabled]));
  await a.bekle(560);   // "Sessizlikleri bul" yeniden göründükten sonraki çift tık koruması
  await a.tikla("cut-analyze");
  await a.tikla("cut-apply");
  ok("…Sessizlikleri yeniden bul (zarf ve doğrulama önbellekten, ffmpeg yok) → Uygula yeni konumdaki kesimleri gönderir (33.65, 36.15), hak bir kez",
    a.kayit.runAkis.length === 1 && a.kayit.run.length === 1 && uygulamalar(a).length === 1 && JSON.stringify(baslar(a, 0)) === "[33.65,36.15]" && a.kayit.harca.length === 1,
    JSON.stringify([a.kayit.runAkis.length, a.kayit.run.length, baslar(a, 0), a.kayit.harca.length]));

  /* b) Kırpıldı (baştan 1 sn: in 0 → 1, clipStart aynı, clipEnd 36 → 35), yoklama yok: uygulanmaz */
  var b = kabi.kesimPaneli({ K: KT, ffmpeg: "ffmpeg", clip: klipA });
  await b.tikla("cut-analyze");
  b.ctx({ mediaPath: "/sahte/tasi.mp4", inPoint: 1, outPoint: 6, clipStart: 30, clipEnd: 35 }, null, true);
  await b.tikla("cut-apply");
  ok("kırpılan klip (in 0 → 1, aynı clipStart), yoklama yok: KS_applyCuts gönderilmez, hak düşmez, aynı uyarı",
    uygulamalar(b).length === 0 && b.kayit.harca.length === 0 && b.el("cut-status").textContent === UYGULA && b.el("cut-result").hidden === true,
    cagrilar(b) + " " + b.el("cut-status").textContent);
  // onContext de geldi (ör. seçim sayısı değişti): in / out da sayılır, analiz düşer (eskiden yalnız medya ve clipStart)
  var b2 = kabi.kesimPaneli({ K: KT, ffmpeg: "ffmpeg", clip: klipA });
  await b2.tikla("cut-analyze");
  b2.ctx({ mediaPath: "/sahte/tasi.mp4", inPoint: 0, outPoint: 5, clipStart: 30, clipEnd: 35 });
  await b2.tikla("cut-apply");   // (düğme gizli #cut-result'ın içinde; tık yine de hiçbir şey göndermez)
  ok("onContext: aynı medya ve clipStart, out 6 → 5: analiz düşer (sonuç gizli), Uygula Premiere'e hiçbir şey göndermez",
    b2.el("cut-result").hidden === true && b2.kayit.call.length === 0 && b2.kayit.harca.length === 0, String(b2.el("cut-result").hidden) + " " + cagrilar(b2));

  /* c) Taşındı, panel yokladı (onPoll; seçim anahtarı değişmedi, onContext gelmez): analiz bırakılır, nedeni söylenir */
  var c = kabi.kesimPaneli({ K: KT, ffmpeg: "ffmpeg", clip: klipA });
  await c.tikla("cut-analyze");
  c.ctx(klipB, null, true);
  c.yokla();
  ok("yoklama taşınan klibi gördü: harita bırakılır, 'Seçili klip analizden sonra değişti … öneriler eski konumdaydı', Kesimleri uygula kapalı",
    c.el("cut-result").hidden === true && c.el("cut-status").textContent === HARITA && /warn/.test(c.el("cut-status").className) &&
    c.el("cut-apply").disabled === true && c.kayit.call.length === 0, JSON.stringify([c.el("cut-result").hidden, c.el("cut-status").textContent]));
  c.kaydir("cut-pad", "0.1");
  await c.bekle(160);
  ok("…kaydırıcı eski konuma harita kurmaz", c.el("cut-result").hidden === true && c.el("cut-ranges").children.length === 0 && c.el("cut-apply").disabled === true,
    c.el("cut-summary").textContent);
  c.kaydir("cut-pad", "0.15");
  await c.bekle(560);
  await c.tikla("cut-analyze");
  await c.tikla("cut-apply");
  ok("…yeniden bul (ffmpeg yok) → Uygula yeni konumda (33.65, 36.15)", c.kayit.runAkis.length === 1 && JSON.stringify(baslar(c, 0)) === "[33.65,36.15]",
    JSON.stringify([c.kayit.runAkis.length, baslar(c, 0)]));

  /* c2) Uygula sürerken gelen yoklama analizi kilitte bırakmaz: Uygula'nın kendi denetimi durdurur, mesaj onunki */
  var c2 = null;
  c2 = kabi.kesimPaneli({ K: KT, ffmpeg: "ffmpeg", clip: klipA, getContext: function (bag) { c2.yokla(); return bag; } });
  await c2.tikla("cut-analyze");
  c2.ctx(klipB, null, true);
  await c2.tikla("cut-apply");
  ok("Uygula sürerken yoklama (klip taşınmış): kilitte analiz bırakılmaz, Uygula'nın denetimi durdurur ('✕ … uygulanmadı'), KS_applyCuts yok",
    uygulamalar(c2).length === 0 && c2.kayit.harca.length === 0 && c2.el("cut-status").textContent === UYGULA && c2.el("cut-result").hidden === true,
    c2.el("cut-status").textContent);

  /* d) Yerinde duran klipte yoklama: analiz kalır, Uygula denetimden geçer */
  var d = kabi.kesimPaneli({ K: KT, ffmpeg: "ffmpeg", clip: klipA });
  await d.tikla("cut-analyze");
  d.ctx({ mediaPath: "/sahte/tasi.mp4", inPoint: 0, outPoint: 6, clipStart: 30, clipEnd: 36 }, null, true);   // aynı klip, yeni bağlam nesnesi
  d.yokla();
  ok("aynı yerdeki klipte yoklama: analiz kalır (2 kesim), uyarı yok", d.el("cut-result").hidden === false && /^2 kesim/.test(d.el("cut-summary").textContent) &&
    d.el("cut-status").textContent === "", d.el("cut-status").textContent);
  await d.tikla("cut-apply");
  ok("…Uygula: KS_getContext sonra KS_applyCuts (31.15, 33.65), hak bir kez", cagrilar(d) === "KS_getContext,KS_applyCuts" &&
    JSON.stringify(baslar(d, 0)) === "[31.15,33.65]" && d.kayit.harca.length === 1, cagrilar(d) + " " + JSON.stringify(baslar(d, 0)));

  /* e) Premiere klibin yerini döndüremedi: gönderilmez, hak düşmez, analiz kalır (yeniden denenebilir) */
  var e = kabi.kesimPaneli({ K: KT, ffmpeg: "ffmpeg", clip: klipA,
    getContext: function () { return { ok: false, error: "Premiere yanıt vermedi (KS_getContext) — işlem zaman aşımına uğradı." }; } });
  await e.tikla("cut-analyze");
  await e.tikla("cut-apply");
  ok("KS_getContext başarısız: KS_applyCuts gönderilmez, hak düşmez, '✕ Klibin yeri Premiere'den okunamadı …', harita kalır, Uygula yeniden açık",
    uygulamalar(e).length === 0 && e.kayit.harca.length === 0 && e.el("cut-status").textContent === OKUNAMADI && /bad/.test(e.el("cut-status").className) &&
    e.el("cut-result").hidden === false && e.el("cut-apply").disabled === false, JSON.stringify([cagrilar(e), e.el("cut-status").textContent, e.el("cut-apply").disabled]));

  /* f) Başka sekans etkin (yoklama yok): denetim karar vermez, KS_applyCuts expectSeqId ile reddeder ("Etkin sekans değişti") */
  var f = kabi.kesimPaneli({ K: KT, ffmpeg: "ffmpeg", clip: klipA, ctx: { sequenceId: "seq-1" },
    applyCuts: function (yuk) {
      return yuk.expectSeqId === "seq-2" ? { ok: true, newSeq: "Kopya", removed: 2 } : { ok: false, kod: "sekans", error: "Etkin sekans degisti; kesimler uygulanmadi." };
    } });
  await f.tikla("cut-analyze");
  f.ctx(null, { sequenceId: "seq-2" }, true);
  await f.tikla("cut-apply");
  ok("başka sekansa geçildi (yoklama yok): klip uyarısı değil, host'un 'Etkin sekans değişti' reddi; hak düşmez",
    uygulamalar(f).length === 1 && uygulamalar(f)[0].payload.expectSeqId === "seq-1" && f.kayit.harca.length === 0 &&
    /^✕ Etkin sekans değişti/.test(f.el("cut-status").textContent), f.el("cut-status").textContent);
}

/*
 * ---- 3.4 adım 8: Uygula'dan sonra "Altyazıyı yeni kurguya uyarla" (js/kesim-altyazi.js, sahte KCaptions) ----
 * Kopya sekansta: kesim host'un esleme raporuyla kaydedilir (kaynak, kopyanın kimliği, kare, gerçek kayma), satır
 * yalnız kopya açıkken görünür, tık KCaptions.kurguyaUyarla(kopya). Bu sekansta + Sadece kes + seç: kayıt / satır yok;
 * Ripple boşluk moduna düştüyse (rippleFallback) kayıt boşluk modunda.
 */
async function altyaziTestleri(K1) {
  var pcm5 = pcmMono([[1.0, 1], [1.5, 0], [1.0, 1], [1.5, 0], [1.0, 1]]);   // 6 sn; sessizlik 1.0–2.5 ve 3.5–5.0
  var K5 = {};
  for (var k in K1) K5[k] = K1[k];
  K5.runAkis = function (cmd, args, opts) {
    opts.onStderr(CIKIS);
    opts.onData(pcm5);
    return Promise.resolve({ code: 0, stderr: CIKIS, bayt: pcm5.length });
  };
  K5.run = function () { return Promise.resolve({ code: 0, stderr: sdCiktisi([[1.0, 2.5], [3.5, 5.0]]) }); };
  var klip5 = { mediaPath: "/sahte/altyazi.mp4", inPoint: 0, outPoint: 6, clipStart: 30, clipEnd: 36 };
  function panel(o) {
    var w = { kayit: [], uyarla: [], belge: o.belge || "seq-1" };
    w.C = {
      kesimKaydet: function (kk) { w.kayit.push(kk); return w.kayit.length; },
      kurguDurumu: function (h) {
        var son = w.kayit[w.kayit.length - 1];
        return son && son.kaynak === w.belge && son.hedef === h && !w.uyarla.length ? { ok: true, adim: 1, satir: 4 } : { ok: false, neden: "guncel" };
      },
      kurguyaUyarla: function (h) { w.uyarla.push(h); return { ok: true, satir: 4, dusen: 1, kirpilan: 0, adim: 1 }; }
    };
    w.p = kabi.kesimPaneli({ K: K5, ffmpeg: "ffmpeg", clip: klip5, altyazi: w.C, ctx: { sequenceId: "seq-1", sequence: "Vlog", frame: 0.04 },
      applyCuts: function (yuk) {
        var hedef = yuk.cloneFirst ? "seq-1-kopya" : "seq-1";
        return { ok: true, newSeq: yuk.cloneFirst ? "Vlog — Suflo Temiz" : "", removed: 4, selected: yuk.removeMode === "select" ? 4 : 0, rippleFallback: !!o.fallback,
          esleme: { kaynak: "seq-1", seqId: hedef, kare: 0.04, kesimler: yuk.ranges.map(function (r) {
            var y = { start: r.start, end: r.end };
            if (yuk.removeMode === "ripple" && !o.fallback) y.kayma = r.end - r.start;
            return y;
          }) } };
      } });
    return w;
  }
  /* a) Kopya sekansta */
  var w = panel({}), p = w.p;
  await p.tikla("cut-analyze");
  ok("adım 8: Uygula'dan önce satır gizli", p.el("cut-altyazi").hidden === true);
  await p.tikla("cut-apply");
  var ac = p.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; });
  ok("adım 8: KS_applyCuts esleme raporunu ister", ac.length === 1 && ac[0].payload.esleme === true, JSON.stringify(ac.length && ac[0].payload).slice(0, 160));
  var kay = w.kayit[0];
  ok("adım 8: kesim kaydı — kaynak analiz edilen sekans, hedef kopya (host), ripple, kare, gerçek kayma",
    w.kayit.length === 1 && kay.kaynak === "seq-1" && kay.hedef === "seq-1-kopya" && kay.hedefAd === "Vlog — Suflo Temiz" && kay.mod === "ripple" && kay.kare === 0.04 &&
    kay.cuts.length === 2 && Math.abs(kay.cuts[0].start - 31.15) < 1e-6 && Math.abs(kay.cuts[0].kayma - 1.2) < 1e-6, JSON.stringify(kay));
  ok("adım 8: satır ve 'Altyazıyı yeni kurguya uyarla' görünür (belge özgün sekansın)",
    p.el("cut-altyazi").hidden === false && p.el("cut-altyazi-uyarla").hidden === false && /4 satır/.test(p.el("cut-altyazi-metin").textContent), p.el("cut-altyazi-metin").textContent);
  p.ctx(null, { sequenceId: "seq-1", sequence: "Vlog" });
  ok("adım 8: özgün sekans açılınca satır gizli (sekans tutmuyor)", p.el("cut-altyazi").hidden === true);
  p.ctx(null, { sequenceId: "seq-1-kopya", sequence: "Vlog — Suflo Temiz" });
  ok("adım 8: kopya açılınca yine görünür", p.el("cut-altyazi").hidden === false);
  p.el("cut-altyazi-uyarla").fire("click");
  ok("adım 8: tık kopyanın kimliğiyle uyarlar, bildirim, satır kapanır", w.uyarla.length === 1 && w.uyarla[0] === "seq-1-kopya" && p.el("cut-altyazi").hidden === true &&
    p.kayit.toast.some(function (t) { return /Altyazı yeni kurguya uyarlandı: 4 satır · kesilen 1 satır çıkarıldı/.test(t[0]); }), JSON.stringify(p.kayit.toast));
  ok("adım 8: eylem deneme hakkı harcamaz (hak yalnız Uygula'da bir kez)", p.kayit.harca.length === 1 && p.kayit.gate.every(function (g) { return g[0] === "cut"; }));

  /* b) Bu sekansta + Sadece kes + seç: hiçbir şey silinmedi */
  var w2 = panel({}), p2 = w2.p;
  p2.hedef("here");
  await p2.tikla("cut-analyze");
  await p2.tikla("cut-apply");
  ok("adım 8: Sadece kes + seç → kayıt yok, satır yok", p2.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; }).length === 1 && w2.kayit.length === 0 &&
    p2.el("cut-altyazi").hidden === true);

  /* c) Bu sekansta + Ripple, host boşluk moduna düştü */
  var w3 = panel({ fallback: true }), p3 = w3.p;
  p3.hedef("here");
  p3.el("cut-mode").value = "ripple";
  await p3.tikla("cut-analyze");
  await p3.tikla("cut-apply");
  ok("adım 8: rippleFallback → kayıt boşluk modunda, hedef aynı sekans, kayma yok; satır görünür",
    w3.kayit.length === 1 && w3.kayit[0].mod === "gap" && w3.kayit[0].hedef === "seq-1" && w3.kayit[0].cuts.every(function (c) { return c.kayma === undefined; }) &&
    p3.el("cut-altyazi").hidden === false, JSON.stringify(w3.kayit[0]));

  /* d) belge başka sekansın: satır yok */
  var w4 = panel({ belge: "baska" }), p4 = w4.p;
  await p4.tikla("cut-analyze");
  await p4.tikla("cut-apply");
  ok("adım 8: Altyazı sekmesindeki belge başka sekansın → kayıt var, satır gizli", w4.kayit.length === 1 && p4.el("cut-altyazi").hidden === true);
}

/*
 * ---- Uygula sürerken panel kilitli ----
 * KS_applyCuts 900 sn'ye dek beklenir; busy yalnız ffmpeg'i kapsıyordu. Bu arada kaydırıcı / Otomatik / kesim
 * tıklaması updateSummary'yle "Kesimleri uygula"yı yeniden açıyor, ikinci tık aynı sekans zamanlarıyla ikinci
 * KS_applyCuts gönderiyordu (cloneFirst'te az önce kesilen kopya yeniden kesilir; "Bu sekansta" + Ripple'da
 * kullanıcının sekansı iki kez kesilir, konuşma silinir).
 */
async function kilitTestleri(K1) {
  var pcm4 = pcmMono([[1.0, 1], [1.5, 0], [1.0, 1], [1.5, 0], [1.0, 1]]);   // 6 sn; sessizlik 1.0–2.5 ve 3.5–5.0
  var K4 = {};
  for (var k in K1) K4[k] = K1[k];
  K4.runAkis = function (cmd, args, opts) {
    opts.onStderr(CIKIS);
    opts.onData(pcm4);
    return Promise.resolve({ code: 0, stderr: CIKIS, bayt: pcm4.length });
  };
  K4.run = function () { return Promise.resolve({ code: 0, stderr: sdCiktisi([[1.0, 2.5], [3.5, 5.0]]) }); };
  var klip4 = { mediaPath: "/sahte/kilit.mp4", inPoint: 0, outPoint: 6, clipStart: 0, clipEnd: 6 };
  function panel() {
    var askida = [];
    // KS_applyCuts askıda kalır; test w.bitir(sonuç) ile bitirir (kilit bozulup ikinci çağrı giderse o da biter, test asılı kalmaz)
    var w = { bitir: function (r) { var l = askida; askida = []; l.forEach(function (coz) { coz(r); }); } };
    w.p = kabi.kesimPaneli({ K: K4, ffmpeg: "ffmpeg", clip: klip4, applyCuts: function () { return new Promise(function (coz) { askida.push(coz); }); } });
    return w;
  }
  function uygulamalar(p) { return p.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; }).length; }

  /* a) KS_applyCuts beklerken her yol denenir, sonra başarı */
  var w = panel(), p = w.p;
  await p.tikla("cut-analyze");
  var ozet = p.el("cut-summary").textContent;
  ok("kilit: analiz 2 kesim, Uygula açık", /^2 kesim · −2\.4 sn/.test(ozet) && p.el("cut-apply").disabled === false, ozet);
  var ilk = p.tikla("cut-apply");
  await p.bekle(20);
  ok("kilit: KS_applyCuts askıda — 'Uygulanıyor…', Uygula ve Sessizlikleri bul kapalı",
    uygulamalar(p) === 1 && p.el("cut-status").textContent === "Uygulanıyor…" && p.el("cut-apply").disabled === true && p.el("cut-analyze").disabled === true,
    uygulamalar(p) + " · " + p.el("cut-status").textContent);
  p.kaydir("cut-pad", "0.1");
  await p.bekle(160);
  ok("kilit: Tampon kaydırıcısı haritayı değiştirmez, Kesimleri uygula'yı yeniden açmaz",
    p.el("cut-apply").disabled === true && p.el("cut-summary").textContent === ozet, p.el("cut-summary").textContent + " disabled=" + p.el("cut-apply").disabled);
  // beklenmez: kilit bozulursa ikinci uygulama da askıda kalır (w.bitir hepsini bitirir)
  var tiklar = [ilk, p.tikla("cut-apply")];
  await p.bekle(20);
  ok("kilit: kaydırıcıdan sonra ikinci Kesimleri uygula tıkı ikinci KS_applyCuts göndermez", uygulamalar(p) === 1, uygulamalar(p));
  p.tikla("cut-noise-auto");
  ok("kilit: Otomatik eşiği ve haritayı değiştirmez, Uygula kapalı",
    p.el("cut-noise").value === "-38" && p.el("cut-summary").textContent === ozet && p.el("cut-apply").disabled === true, p.el("cut-noise").value);
  var kesimSpan = p.el("cut-bar").children.filter(function (s) { return /\bcut\b/.test(s.className); });
  kesimSpan[0].onclick();
  ok("kilit: kesim çubuğu tıklaması kesimi kapatmaz, Uygula kapalı",
    p.el("cut-summary").textContent === ozet && p.el("cut-apply").disabled === true && !/ off/.test(p.el("cut-bar").children.filter(function (s) { return /\bcut\b/.test(s.className); })[0].className),
    p.el("cut-summary").textContent);
  var satir = p.el("cut-ranges").children[1];
  satir.children[0].checked = false;
  satir.children[0].onchange();
  ok("kilit: liste onay kutusu kesimi kapatmaz (kutu eski haline çizilir), Uygula kapalı",
    p.el("cut-summary").textContent === ozet && p.el("cut-apply").disabled === true && p.el("cut-ranges").children[1].children[0].checked === true,
    p.el("cut-summary").textContent);
  p.ctx(klip4);   // bağlam yoklaması: refreshButton
  ok("kilit: bağlam değişimi Uygula'yı açmaz, 'Uygulanıyor…' silinmez",
    p.el("cut-apply").disabled === true && p.el("cut-analyze").disabled === true && p.el("cut-status").textContent === "Uygulanıyor…", p.el("cut-status").textContent);
  tiklar.push(p.tikla("cut-apply"));
  await p.bekle(20);
  ok("kilit: üçüncü tık da KS_applyCuts / ffmpeg çağırmaz", uygulamalar(p) === 1 && p.kayit.run.length === 1, uygulamalar(p));
  w.bitir({ ok: true, newSeq: "Kopya" });
  await Promise.all(tiklar);
  w.bitir({ ok: true, newSeq: "Kopya" });   // (kilit bozuksa sonradan gönderilen uygulamalar da bitsin)
  ok("kilit: KS_applyCuts bitince tek uygulama, hak bir kez, harita kapandı, Uygula kapalı, Sessizlikleri bul açık",
    uygulamalar(p) === 1 && p.kayit.harca.length === 1 && p.el("cut-result").hidden === true && p.el("cut-apply").disabled === true && p.el("cut-analyze").disabled === false,
    uygulamalar(p) + " / " + p.kayit.harca.length);
  p.kaydir("cut-pad", "0.15");
  await p.bekle(160);
  ok("kilit: başarıdan sonra kilitteki kaydırıcı değişimi eski zarftan harita kurmaz", p.el("cut-result").hidden === true && p.el("cut-apply").disabled === true && p.el("cut-bar").children.length === 0);

  /* b) KS_applyCuts başarısız: kilit açılır, hata kalır, kilitte bekleyen Tampon haritaya işlenir, yeniden denenebilir */
  var v = panel(), q = v.p;
  await q.tikla("cut-analyze");
  var ilk2 = q.tikla("cut-apply");
  await q.bekle(20);
  q.kaydir("cut-pad", "0.3");
  await q.bekle(160);
  ok("başarısız öncesi: kilitte harita eski Tampon'la (0.15) kalır", /^2 kesim · −2\.4 sn/.test(q.el("cut-summary").textContent) && q.el("cut-apply").disabled === true, q.el("cut-summary").textContent);
  v.bitir({ ok: false, error: "Sekans kilitli" });
  await ilk2;
  ok("başarısız: hata durum satırında, harita bekleyen Tampon 0.3 ile kuruldu, Uygula ve Sessizlikleri bul açık, hak düşmedi",
    q.el("cut-status").textContent === "✕ Sekans kilitli" && /bad/.test(q.el("cut-status").className) && /^2 kesim · −1\.8 sn/.test(q.el("cut-summary").textContent) &&
    q.el("cut-apply").disabled === false && q.el("cut-analyze").disabled === false && q.kayit.harca.length === 0,
    q.el("cut-status").textContent + " · " + q.el("cut-summary").textContent);
  var ilk3 = q.tikla("cut-apply");
  await q.bekle(20);
  var son = q.kayit.call.filter(function (x) { return x.fn === "KS_applyCuts"; });
  ok("başarısız sonrası yeniden Uygula: ikinci KS_applyCuts yeni Tampon'la (1.3–2.2, 3.8–4.7)",
    son.length === 2 && son[1].payload.ranges.length === 2 && Math.abs(son[1].payload.ranges[0].start - 1.3) < 1e-6 && Math.abs(son[1].payload.ranges[1].end - 4.7) < 1e-6,
    JSON.stringify(son.length && son[son.length - 1].payload.ranges));
  v.bitir({ ok: true, newSeq: "Kopya" });
  await ilk3;
}

// Bir söz hiç çözülmezse (ör. askıda kalan sahte KS_applyCuts) Node olay döngüsü boşalınca 0 koduyla sessizce
// çıkardı ve tools/test.js bunu GECTI sayardı: özet yazılmadan çıkış başarısızlıktır.
var tamamlandi = false;
process.on("exit", function () {
  if (!tamamlandi) { console.log("FAIL test-kesim yarıda kaldı: bekleyen bir söz hiç çözülmedi (" + gecti + " gecti, " + kaldi + " kaldi)"); process.exitCode = 1; }
});
canliTestler().catch(function (e) { ok("canli esik testleri coktu: " + (e && e.stack || e), false); }).then(function () {
  tamamlandi = true;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
});
