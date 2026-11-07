// Suflo testi: ses zarfı / konuşma başlangıçları — js/ses-zarf.js
//  - 10 ms RMS zarfı, alt-pencere sınır hassasiyeti, spektral akıyla bitişik kelime başı
//  - akış: Buffer (tek bayt taşıma) / Int16Array / Float32Array aynı sonucu verir
//  - uyarlanır gürültü tabanı (taban ortada yükselir), düşük kontrast
//  - ffmpeg çıkarma: argümanlar, sahte köprüyle akış, önbellek (medya + aralık + dosya değişimi), iptal, ffmpeg yok
//  - gerçek ffmpeg (varsa): lavfi ton patlamalı wav → bilinen sınırlar, -ss / -t aralığı, gerçek süreç iptali
//  - 1 saatlik ses akışla birkaç saniyede
var fs = require("fs");
var os = require("os");
var path = require("path");
var cp = require("child_process");
var Z = require("../js/ses-zarf.js");
var SZ = require("../js/sessizlik.js");
var G = require("./_senkron-sentetik.js");
var GK = require("./_gercek-k.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
var SR = 16000;

function tonlar(parcalar, sure, gurultu) {
  var x = new Float32Array(Math.round(sure * SR));
  var r = G.rastgele(17);
  for (var i = 0; i < x.length; i++) x[i] = (gurultu || 1e-4) * (r() * 2 - 1);
  parcalar.forEach(function (p) {
    for (var k = Math.round(p.a * SR); k < Math.round(p.b * SR) && k < x.length; k++) x[k] += p.g * Math.sin(2 * Math.PI * p.f * k / SR);
  });
  return x;
}

/* ---------------- 1) sınırlar ---------------- */
var P = [{ a: 0.2537, b: 1.0, f: 1000, g: 0.5 }, { a: 1.3, b: 1.8123, f: 500, g: 0.3 }, { a: 2.1049, b: 2.33, f: 300, g: 0.05 }];
var a = Z.analizEt(tonlar(P, 3));
ok("3 ton patlaması → 3 konuşma bölümü", a.bolumler.length === 3, J(a.bolumler));
var basH = P.map(function (p, i) { return a.bolumler[i] ? Math.abs(a.bolumler[i].bas - p.a) * 1000 : 999; });
var sonH = P.map(function (p, i) { return a.bolumler[i] ? Math.abs(a.bolumler[i].son - p.b) * 1000 : 999; });
ok("alt-pencere sınırı: başlar / sonlar ≤ 3 ms (10 ms ızgaranın ortası dahil)", basH.every(function (d) { return d <= 3; }) && sonH.every(function (d) { return d <= 3; }), J(basH) + " " + J(sonH));
ok("başlangıç / bitiş listeleri sıralı, sessizlikten çıkış g = 1", a.onsetler.length >= 3 && a.onsetler.every(function (x, i) { return !i || x.t >= a.onsetler[i - 1].t; }) &&
  P.every(function (p) { var y = Z.enYakin(a.onsetler, p.a); return y && y.d < 0.004 && y.x.g === 1; }));
ok("zarf 10 ms (3 sn → 300 pencere), konuşma ≈ -9 dB, taban ≈ -85 dB, kontrast büyük", a.n === 300 && Math.abs(a.db[50] - (20 * Math.log10(0.5 / Math.SQRT2))) < 0.3 && a.tabanDb < -80 && a.kontrast > 60,
  a.n + " " + a.db[50].toFixed(2) + " " + a.tabanDb + " " + a.kontrast);
ok("konusmaOrani(): ton içi 1, sessizlik 0", Z.konusmaOrani(a, 0.4, 0.9) === 1 && Z.konusmaOrani(a, 1.05, 1.25) === 0);

// bitişik kelimeler (sessizlik yok, yalnız perde değişir): spektral akı başlangıcı
var g = G.uret({ tohum: 7, kelime: 60 });
var aG = Z.analizEt(g.pcm);
var bitisik = g.kelimeler.filter(function (w, i) { return i && Math.abs(g.kelimeler[i - 1].end - w.start) < 1e-6; });
var bH = bitisik.map(function (w) { var y = Z.enYakin(aG.onsetler, w.start); return y ? y.d * 1000 : 999; });
ok("bitişik kelime başları (" + bitisik.length + ") akı tepesinden ±15 ms içinde bulunur", bitisik.length >= 4 && bH.every(function (d) { return d <= 15; }), J(bH.map(Math.round)));
var tumH = g.kelimeler.map(function (w) { var y = Z.enYakin(aG.onsetler, w.start); return y ? y.d * 1000 : 999; });
ok("tüm kelime başlarının ortalama başlangıç hatası < 5 ms", tumH.reduce(function (x, y) { return x + y; }, 0) / tumH.length < 5, (tumH.reduce(function (x, y) { return x + y; }, 0) / tumH.length).toFixed(2));
var yalanci = aG.onsetler.filter(function (x) { var y = null; g.kelimeler.forEach(function (w) { var d = Math.abs(w.start - x.t); if (y === null || d < y) y = d; }); return y > 0.05; });
ok("kelime başı olmayan başlangıç azdır (≤ %10)", yalanci.length <= aG.onsetler.length * 0.1, yalanci.length + "/" + aG.onsetler.length);

/* ---------------- 2) akış eşdeğerliği ---------------- */
var i16 = G.int16(g.pcm);
var buf = Buffer.from(i16.buffer, i16.byteOffset, i16.byteLength);
var a1 = Z.analizEt(i16);
var an = Z.analizci();
for (var i = 0; i < buf.length;) { var boy = 1 + (i % 13) * 777; an.besle(buf.subarray(i, i + boy)); i += boy; }
var a2 = an.bitir();
var f32 = new Float32Array(i16.length);
for (i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
var a3 = Z.analizEt(f32);
function ayni(x, y) { if (x.n !== y.n) return false; for (var k = 0; k < x.n; k++) if (Math.abs(x.db[k] - y.db[k]) > 1e-3 || Math.abs(x.aki[k] - y.aki[k]) > 1e-4) return false; return J(x.onsetler) === J(y.onsetler) && J(x.bolumler) === J(y.bolumler); }
ok("Buffer tek / tuhaf boylu parçalar (tek bayt taşınır) = Int16Array bütün = Float32Array", ayni(a1, a2) && ayni(a1, a3), a1.n + " " + a2.n + " " + a3.n);
ok("örnek sayısı tutar", a2.ornek === i16.length);
var yarim = Z.analizEt(new Float32Array(16000 + 80));
ok("yarım son pencere de sayılır (1 sn + 5 ms → 101 pencere)", yarim.n === 101);
var bos = Z.analizEt(new Float32Array(0));
ok("boş ses: n 0, liste boş, hata yok", bos.n === 0 && bos.onsetler.length === 0 && bos.bolumler.length === 0);
var biten = Z.analizci(); biten.bitir();
var hata = null; try { biten.besle(new Float32Array(10)); } catch (e) { hata = e; }
ok("bitmiş analizciye besleme hata verir", !!hata);

/* ---------------- 3) uyarlanır taban ---------------- */
// 0-31.7 sn taban -75 dB, sonra -45 dB (klima açıldı; blok sınırına denk gelmez); konuşma -12 dB her iki yarıda
var uz = 60, ADIM = 31.7, xu = new Float32Array(uz * SR), ru = G.rastgele(5), parc = [];
for (i = 0; i < xu.length; i++) xu[i] = (i < ADIM * SR ? 1.8e-4 : 5.6e-3) * (ru() * 2 - 1) * 1.732;
for (var t = 1; t < uz - 1; t += 2.3) { parc.push(t); for (var k = Math.round(t * SR); k < Math.round((t + 0.6) * SR); k++) xu[k] += 0.35 * Math.sin(2 * Math.PI * 220 * k / SR); }
var aU = Z.analizEt(xu);
ok("taban ilk yarıda ≈ -75 dB, ikinci yarıda ≈ -45 dB'ye yükselir", aU.taban[1000] < -70 && aU.taban[5000] > -50 && aU.taban[5000] < -40, aU.taban[1000].toFixed(1) + " / " + aU.taban[5000].toFixed(1));
var bulunan = parc.filter(function (t2) { var y = Z.enYakin(aU.onsetler, t2); return y && y.d < 0.01; });
ok("iki yarıdaki tüm konuşma başları bulunur", bulunan.length === parc.length, bulunan.length + "/" + parc.length);
// konuşma DIŞINDA kalan "konuşma" süresi: taban sıçramasından sonra en çok bir blok (2,5 sn), sonra hiç
var disari = 0, gec = 0;
for (i = 0; i < aU.n; i++) {
  if (!aU.aktif[i]) continue;
  var tt = i * 0.01, ici2 = parc.some(function (t2) { return tt >= t2 - 0.02 && tt < t2 + 0.62; });
  if (!ici2) { disari += 0.01; if (tt > ADIM + 2.5) gec++; }
}
ok("gürültülü yarıda sahte konuşma yalnız sıçramadan sonraki ≤ 2,5 sn'de (sonra hiç)", disari <= 2.5 && gec === 0, disari.toFixed(2) + " sn, geç " + gec);
var aDus = Z.analizEt(G.uret({ tohum: 5, kelime: 40, gurultuDb: -14 }).pcm);
ok("konuşma gürültü düzeyindeyse kontrast < 10 dB", aDus.kontrast < 10, aDus.kontrast);

/* ---------------- 4) ffmpeg argümanları ---------------- */
var args = Z.cikarmaArgs("C:\\a b\\ç.mp4", 12.3456, 30);
ok("çıkarma: -ss / -t girişten önce, ilk ses akışı, 16 kHz mono s16le, pipe:1", J(args.slice(3, 7)) === J(["-ss", "12.346", "-t", "30"]) && args[8] === "C:\\a b\\ç.mp4" &&
  args.join(" ").indexOf("-map 0:a:0? -vn") !== -1 && args.join(" ").indexOf("-ac 1 -ar 16000 -acodec pcm_s16le -f s16le pipe:1") !== -1, J(args));
ok("çıkarma: zaman ekseni süzgeci sessizlik.js ile aynı (ses kayması / PTS boşlukları sessizlikle dolar)", args[args.indexOf("-af") + 1] === SZ.ZAMAN_SUZGECI && Z.ZAMAN_SUZGECI === SZ.ZAMAN_SUZGECI);
ok("çıkarma: in 0 / dur 0 → -ss / -t yok", Z.cikarmaArgs("x.wav", 0, 0).indexOf("-ss") === -1 && Z.cikarmaArgs("x.wav", 0, 0).indexOf("-t") === -1);

/* ---------------- 5) sahte köprüyle çıkarma, önbellek, iptal ---------------- */
function jeton() {
  var d = [], j = { iptalEdildi: false, iptal: function () { if (j.iptalEdildi) return; j.iptalEdildi = true; d.splice(0).forEach(function (f) { f(); }); },
    dinle: function (f) { if (j.iptalEdildi) { f(); return function () {}; } d.push(f); return function () { var k = d.indexOf(f); if (k !== -1) d.splice(k, 1); }; } };
  return j;
}
var cagri = [], mtime = 1000;
function sahteK(secenek) {
  secenek = secenek || {};
  return {
    fs: { statSync: function () { return { size: buf.length, mtimeMs: mtime }; } },
    log: function () {},
    findFfmpeg: function () { return Promise.resolve(secenek.ffYok ? null : "/bin/ffmpeg"); },
    runAkis: function (cmd, ar, o) {
      cagri.push(ar);
      return new Promise(function (resolve) {
        var birak = null, bitti = false, i2 = 0;
        if (o.iptal) birak = o.iptal.dinle(function () { if (bitti) return; bitti = true; resolve({ code: -2, iptal: true, stderr: "", bayt: i2 }); });
        (function adim() {
          if (bitti) return;
          if (i2 >= buf.length) { bitti = true; if (birak) birak(); resolve({ code: secenek.kod || 0, stderr: secenek.kod ? "Output file #0 does not contain any stream" : "", bayt: i2 }); return; }
          o.onData(buf.subarray(i2, i2 + 32001)); i2 += 32001;
          if (secenek.ilkParcadaIptal) { secenek.ilkParcadaIptal.iptal(); return; }
          setImmediate(adim);
        })();
      });
    }
  };
}
(async function () {
  Z.onbellek.temizle();
  var ilerleme = [];
  var c1 = await Z.sesZarfiCikar({ K: sahteK(), media: "/v/klip.mp4", inPoint: 3, dur: g.sure, onIlerleme: function (o) { ilerleme.push(o); } });
  ok("sahte köprü: PCM akışı analiz edilir, sonuç bitişik çözümlemeyle aynı", c1.analiz && ayni(c1.analiz, a1) && !c1.onbellekten, c1.neden);
  ok("sahte köprü: ffmpeg'e cikarmaArgs gider, ilerleme artan 0..1", J(cagri[0]) === J(Z.cikarmaArgs("/v/klip.mp4", 3, g.sure)) && ilerleme.length > 3 &&
    ilerleme.every(function (v, k) { return v >= 0 && v <= 1 && (!k || v >= ilerleme[k - 1]); }) && ilerleme[ilerleme.length - 1] > 0.98, ilerleme.length + " " + ilerleme.slice(-1));
  var c2 = await Z.sesZarfiCikar({ K: sahteK(), media: "/v/klip.mp4", inPoint: 3, dur: g.sure });
  ok("önbellek: aynı medya + aralık + dosya → ffmpeg yeniden çalışmaz, aynı analiz", c2.onbellekten && c2.analiz === c1.analiz && cagri.length === 1);
  await Z.sesZarfiCikar({ K: sahteK(), media: "/v/klip.mp4", inPoint: 4, dur: g.sure });
  ok("önbellek: başka aralık → yeniden çözümlenir", cagri.length === 2);
  mtime = 2000;
  var c3 = await Z.sesZarfiCikar({ K: sahteK(), media: "/v/klip.mp4", inPoint: 3, dur: g.sure });
  ok("önbellek: dosya değişti (değişim zamanı) → yeniden çözümlenir", !c3.onbellekten && cagri.length === 3);
  ok("önbellek anahtarı yol / aralık / dosya özetinden; açık yol taşımaz", Z.anahtar("/v/klip.mp4", 3, 10, { size: 1, mtimeMs: 2 }) !== Z.anahtar("/v/klip.mp4", 3, 10, { size: 1, mtimeMs: 3 }) &&
    Z.anahtar("/v/klip.mp4", 3, 10).indexOf("klip") === -1);
  var c4 = await Z.sesZarfiCikar({ K: sahteK(), media: "/v/klip.mp4", inPoint: 3, dur: g.sure, onbellek: false });
  ok("onbellek: false → önbellek atlanır", !c4.onbellekten && cagri.length === 4);
  // geçici ses (Oluştur'un motor sesi, finally siler) önbelleğe de YAZILMAZ: 6 girdilik önbellekte gerçek klipleri düşürmesin
  var c4b = await Z.sesZarfiCikar({ K: sahteK(), media: "/v/gecici.wav", inPoint: 0, dur: g.sure, onbellek: false });
  var c4c = await Z.sesZarfiCikar({ K: sahteK(), media: "/v/gecici.wav", inPoint: 0, dur: g.sure });
  ok("onbellek: false → sonuç önbelleğe yazılmaz (geçici dosya gerçek klipleri düşürmez)", c4b.analiz && !c4c.onbellekten && cagri.length === 6, cagri.length);

  var j1 = jeton();
  var once = cagri.length;
  var c5 = await Z.sesZarfiCikar({ K: sahteK({ ilkParcadaIptal: j1 }), media: "/v/iptal.mp4", inPoint: 0, dur: g.sure, iptal: j1 });
  var c5b = await Z.sesZarfiCikar({ K: sahteK(), media: "/v/iptal.mp4", inPoint: 0, dur: g.sure, iptal: j1 });
  ok("iptal: akış ortasında iptal → { iptal: true }, yarım analiz önbelleğe girmez, iptal edilmiş jetonla ffmpeg başlamaz", c5.iptal === true && !c5.analiz && c5b.iptal === true && cagri.length === once + 1);
  var c6 = await Z.sesZarfiCikar({ K: sahteK(), media: "/v/iptal.mp4", inPoint: 0, dur: g.sure });
  ok("iptalden sonra aynı klip baştan çözümlenir (önbellekte yarım sonuç yok)", c6.analiz && !c6.onbellekten && c6.analiz.n === a1.n);
  var c7 = await Z.sesZarfiCikar({ K: sahteK({ ffYok: true }), media: "/v/yok.mp4", dur: 2 });
  ok("ffmpeg yok → { neden: 'ffmpeg' }", c7.neden === "ffmpeg");
  var c8 = await Z.sesZarfiCikar({ K: sahteK({ kod: 1 }), media: "/v/sessiz.mp4", dur: 2 });
  ok("ffmpeg hata kodu → neden (son stderr satırıyla), önbelleğe girmez", /^kod 1 .*does not contain/.test(c8.neden || "") && !c8.analiz, c8.neden);
  var c9 = await Z.sesZarfiCikar({ K: {}, media: "x", dur: 1 });
  ok("köprü eksik → { neden: 'kopru' }", c9.neden === "kopru");

  // bellekteki PCM için iptal edilebilir analiz
  var j2 = jeton(), say = 0;
  var c10 = await Z.analizEtAsync(f32, { parca: 16000, iptal: j2, onIlerleme: function () { if (++say === 2) j2.iptal(); } });
  ok("analizEtAsync: iptal → { iptal: true } (ikinci parçadan sonra)", c10.iptal === true && say === 2);
  var c11 = await Z.analizEtAsync(buf, { parca: 16001 });
  ok("analizEtAsync: Buffer parçaları çift bayta yuvarlanır, sonuç aynı", ayni(c11, a1));

  /* ---------------- 6) gerçek ffmpeg ---------------- */
  var ffVar = !cp.spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).error;
  if (!ffVar) {
    console.log("ATLA gerçek ffmpeg yok (wav / iptal testleri)");
  } else {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-senkron-"));
    var wav = path.join(dir, "ton.wav");
    // 44.1 kHz stereo: 0.5–0.9 sn 440 Hz, 1.3–1.75 sn 300 Hz (yalnız sol kanal), 2.2–2.6 sn 600 Hz
    var ifade = "0.3*sin(2*PI*440*t)*between(t,0.5,0.9)+0.2*sin(2*PI*600*t)*between(t,2.2,2.6)|0.3*sin(2*PI*440*t)*between(t,0.5,0.9)+0.3*sin(2*PI*300*t)*between(t,1.3,1.75)+0.2*sin(2*PI*600*t)*between(t,2.2,2.6)";
    var u = cp.spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "aevalsrc='" + ifade + "':s=44100:d=3", "-c:a", "pcm_s16le", wav], { encoding: "utf8" });
    /*
     * bridge.js runAkis'in node karşılığı: iptalde süreç AĞACI öldürülür (Windows taskkill /T /F; burada ayrı süreç
     * grubu), sonuç süreç kapanınca döner. Windows CI'nin ffmpeg'i Chocolatey shim'i: child.kill yalnız shim'i öldürür,
     * asıl ffmpeg 10 dk'lık -re akışını sürdürür ve stdout borusunu açık tutar; node süreci özeti yazdıktan sonra da
     * kapanamaz (tools/test.js 180 sn zaman aşımı). acilan: testin sonunda hiçbir süreç açık kalmamalı.
     */
    var acilan = [];
    function gercekK() {
      return {
        fs: fs, log: function () {},
        findFfmpeg: function () { return Promise.resolve("ffmpeg"); },
        runAkis: function (cmd, ar, o) {
          return new Promise(function (resolve) {
            var ch = cp.spawn(cmd, ar, { windowsHide: true, detached: process.platform !== "win32" }), bitti = false, err = "", bayt = 0, birak = null;
            acilan.push(ch);
            ch.on("close", function () { ch.suflo_kapandi = true; ch.emit("suflo-kapandi"); });
            if (o.iptal) birak = o.iptal.dinle(function () {
              if (bitti) return;
              bitti = true;
              GK.agaciOldur(ch);
              var sonuc = { code: -2, iptal: true, stderr: err, bayt: bayt, pid: ch.pid };
              GK.kapanincaCagir(ch, function () { resolve(sonuc); });
            });
            ch.stdout.on("data", function (d) { if (bitti) return; bayt += d.length; o.onData(d); });
            ch.stderr.on("data", function (d) { err += d; });
            ch.on("close", function (code) { if (bitti) return; bitti = true; if (birak) birak(); resolve({ code: code, stderr: err, bayt: bayt }); });
          });
        }
      };
    }
    ok("ffmpeg lavfi ile 44.1 kHz stereo ton wav üretildi", u.status === 0 && fs.existsSync(wav), u.stderr);
    Z.onbellek.temizle();
    var r1 = await Z.sesZarfiCikar({ K: gercekK(), media: wav, inPoint: 0, dur: 3 });
    var bek = [0.5, 1.3, 2.2], bekS = [0.9, 1.75, 2.6];
    var hb = bek.map(function (t2, k2) { return r1.analiz && r1.analiz.bolumler[k2] ? Math.round(Math.abs(r1.analiz.bolumler[k2].bas - t2) * 1000) : 999; });
    var hs = bekS.map(function (t2, k2) { return r1.analiz && r1.analiz.bolumler[k2] ? Math.round(Math.abs(r1.analiz.bolumler[k2].son - t2) * 1000) : 999; });
    ok("gerçek ffmpeg: 16 kHz mono'ya inen wav'da 3 bölüm, sınırlar ≤ 5 ms (tek kanallı ton da)", r1.analiz && r1.analiz.bolumler.length === 3 && hb.every(function (d) { return d <= 5; }) && hs.every(function (d) { return d <= 5; }),
      J(r1.analiz && r1.analiz.bolumler) + " " + J(hb) + " " + J(hs) + " " + (r1.neden || ""));
    var r2 = await Z.sesZarfiCikar({ K: gercekK(), media: wav, inPoint: 1.0, dur: 1.5 });
    ok("gerçek ffmpeg: -ss 1 -t 1.5 aralığı klip ekseninde (1.3–1.75 → 0.3–0.75, 2.2– → 1.2–1.5 kesik, 150 pencere)", r2.analiz && r2.analiz.n === 150 && r2.analiz.bolumler.length === 2 &&
      Math.abs(r2.analiz.bolumler[0].bas - 0.3) <= 0.005 && Math.abs(r2.analiz.bolumler[0].son - 0.75) <= 0.005 && Math.abs(r2.analiz.bolumler[1].bas - 1.2) <= 0.005 && r2.analiz.bolumler[1].son >= 1.49,
      r2.analiz && J(r2.analiz.bolumler) + " n " + r2.analiz.n);
    var r3 = await Z.sesZarfiCikar({ K: gercekK(), media: wav, inPoint: 0, dur: 3 });
    ok("gerçek ffmpeg: ikinci çağrı önbellekten", r3.onbellekten === true);
    var j3 = jeton(), bas3 = Date.now(), sure3 = 0;
    var uzunK = gercekK(), asil = uzunK.runAkis;
    uzunK.runAkis = function (cmd, ar, o) {
      // 10 dakikalık lavfi gürültüsü: ilk PCM parçası gelince iptal
      var ar2 = ["-hide_banner", "-nostdin", "-f", "lavfi", "-re", "-i", "anoisesrc=d=600:a=0.1:r=16000"].concat(ar.slice(ar.indexOf("-map")));
      var ilk = o.onData;
      o.onData = function (d) { ilk(d); if (!j3.iptalEdildi) j3.iptal(); };
      return asil(cmd, ar2, o).then(function (res) { sure3 = Date.now() - bas3; return res; });
    };
    var r4 = await Z.sesZarfiCikar({ K: uzunK, media: path.join(dir, "uzun.wav"), dur: 600, iptal: j3 });
    ok("gerçek ffmpeg iptali: 10 dk'lık akış ilk parçada iptal → { iptal: true }, süreç öldürülür (< 5 sn)", r4.iptal === true && sure3 < 5000, sure3 + " ms");
    ok("gerçek ffmpeg iptali: sonuç süreç ağacı kapandıktan sonra; hiçbir ffmpeg açık kalmadı (yetim süreç / açık boru yok)",
      acilan.length === 3 && acilan.every(function (c) { return c.suflo_kapandi === true; }), acilan.map(function (c) { return !!c.suflo_kapandi; }).join(","));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (eR) {}
  }

  /* ---------------- 7) 1 saatlik başarım ---------------- */
  var g60 = G.uret({ tohum: 11, kelime: 150, sureSn: 60 });
  var p60 = G.int16(g60.pcm.subarray(0, 60 * SR));
  var b60 = Buffer.from(p60.buffer, p60.byteOffset, p60.byteLength);
  var t1 = Date.now(), anS = Z.analizci();
  for (var m = 0; m < 60; m++) for (var q = 0; q < b60.length; q += 65536) anS.besle(b60.subarray(q, Math.min(b60.length, q + 65536)));
  var aS = anS.bitir();
  var sureS = Date.now() - t1;
  ok("1 saatlik 16 kHz PCM (64 KB'lık akış parçaları) < 10 sn'de analiz edilir (360 000 pencere)", aS.n === 360000 && sureS < 10000 && aS.onsetler.length > 5000, sureS + " ms, " + aS.onsetler.length + " başlangıç");
  console.log("     1 saat analiz süresi: " + sureS + " ms");

  console.log("\n" + gecen + "/" + toplam + " geçti");
  if (gecen !== toplam) process.exit(1);
})().catch(function (e) { console.log("FAIL beklenmeyen hata: " + (e && e.stack || e)); process.exit(1); });
