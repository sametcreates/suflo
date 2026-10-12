// Suflo testi: js/sessiz-ses.js sessiz ses denetimi (3.2 adım 2) ve captions.js bağlantısı
//  - WAV başlığı (LIST/bext parçaları, EXTENSIBLE, kayan nokta), tepe |s| ölçümü
//  - parça sınırına düşen örnek (sentetik WAV, küçük parçalar ve gerçek 1 MB sınırı)
//  - eşik sınırı (0,001 ~ -60 dBFS), erken durma, volumedetect ayrıştırma
//  - denetle(): "Yine de devam et" / "Vazgeç", toplu işte tek soru
//  - captions.js: motor (yerel ve bulut yüklemesi) çalışmadan ÖNCE denetlenir; satır içi uyarı
var fs = require("fs"), path = require("path"), os = require("os");
var SS = require(path.join(__dirname, "..", "js", "sessiz-ses.js"));

var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
var bekleyen = [];
function okAsync(ad, p, kontrol) {
  bekleyen.push(Promise.resolve(p).then(function (v) { var r = kontrol(v); ok(ad, r === true, r === true ? undefined : r); },
    function (e) { ok(ad, false, e && e.stack || e); }));
}

/* ---------- sentetik WAV ---------- */
// ornekler: tamsayı örnek değerleri (int biçimler) ya da -1..1 (kayan nokta)
function wav(ornekler, o) {
  o = o || {};
  var bit = o.bit || 16, kanal = o.kanal || 1, oran = o.oran || 16000, bicim = o.bicim || 1;
  var bayt = bit / 8;
  var veri = Buffer.alloc(ornekler.length * bayt);
  for (var i = 0; i < ornekler.length; i++) {
    var v = ornekler[i], p = i * bayt;
    if (bicim === 3) { if (bit === 32) veri.writeFloatLE(v, p); else veri.writeDoubleLE(v, p); }
    else if (bit === 8) veri[p] = v + 128;
    else if (bit === 16) veri.writeInt16LE(v, p);
    else if (bit === 24) veri.writeIntLE(v, p, 3);
    else veri.writeInt32LE(v, p);
  }
  var genis = !!o.extensible;
  var fmt = Buffer.alloc(genis ? 40 : 16);
  fmt.writeUInt16LE(genis ? 0xFFFE : bicim, 0);
  fmt.writeUInt16LE(kanal, 2);
  fmt.writeUInt32LE(oran, 4);
  fmt.writeUInt32LE(oran * kanal * bayt, 8);
  fmt.writeUInt16LE(kanal * bayt, 12);
  fmt.writeUInt16LE(bit, 14);
  if (genis) { fmt.writeUInt16LE(22, 16); fmt.writeUInt16LE(bit, 18); fmt.writeUInt16LE(bicim, 24); }
  var parcalar = [Buffer.from("fmt "), u32(fmt.length), fmt];
  if (o.list) {
    // ffmpeg'in yazdığı gibi LIST/INFO; tek uzunluk -> dolgu baytı (RIFF hizası)
    var bilgi = Buffer.from("INFOISFT\u0005\u0000\u0000\u0000Lavf\u0000");
    parcalar.push(Buffer.from("LIST"), u32(bilgi.length), bilgi);
    if (bilgi.length & 1) parcalar.push(Buffer.from([0]));
  }
  if (o.bext) parcalar.push(Buffer.from("bext"), u32(602), Buffer.alloc(602, 32));
  parcalar.push(Buffer.from("data"), u32(o.veriBoyutu !== undefined ? o.veriBoyutu : veri.length), veri);
  var govde = Buffer.concat(parcalar);
  return Buffer.concat([Buffer.from("RIFF"), u32(4 + govde.length), Buffer.from("WAVE"), govde]);
}
function u32(n) { var b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

// Bellekteki dosya için sahte fs (okuma uzunlukları kaydedilir)
function sahteFs(buf) {
  var f = { okumalar: [], kapandi: 0 };
  f.statSync = function () { return { size: buf.length }; };
  f.openSync = function () { return 7; };
  f.closeSync = function () { f.kapandi++; };
  f.readSync = function (fd, hedef, ofs, uzun, konum) {
    var n = Math.max(0, Math.min(uzun, buf.length - konum));
    buf.copy(hedef, ofs, konum, konum + n);
    f.okumalar.push(uzun);
    return n;
  };
  return f;
}
function sinyal(n, genlik, tohum) {
  var a = [], x = tohum || 12345;
  for (var i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; a.push(Math.round(((x / 0x7fffffff) * 2 - 1) * genlik)); }
  return a;
}

/* ---------- başlık ---------- */
var duz = wav([0, 100, -200]);
var h = SS.wavBasligi(function (k, n) { return duz.slice(k, k + n); }, duz.length);
ok("wavBasligi: 16 bit mono PCM, veri 44. baytta", h && h.bicim === 1 && h.bit === 16 && h.kanal === 1 && h.oran === 16000 && h.veriBas === 44 && h.veriBoyut === 6, JSON.stringify(h));
var listeli = wav([0, 1, 2], { list: true, bext: true });
var h2 = SS.wavBasligi(function (k, n) { return listeli.slice(k, k + n); }, listeli.length);
ok("wavBasligi: LIST (tek uzunluk + dolgu) ve bext parçaları atlanır", h2 && h2.veriBoyut === 6 && listeli.readInt16LE(h2.veriBas + 4) === 2, JSON.stringify(h2));
var akis = wav([0, 1, 2, 3], { veriBoyutu: 0xFFFFFFFF });
var h3 = SS.wavBasligi(function (k, n) { return akis.slice(k, k + n); }, akis.length);
ok("wavBasligi: akıştan yazılmış (boyut 0xFFFFFFFF) veri dosya sonuna kadar", h3 && h3.veriBoyut === 8, JSON.stringify(h3));
ok("wavBasligi: WAV olmayan (MP3) -> null", SS.wavBasligi(function (k, n) { var b = Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000xxxxxxxxxxxx"); return b.slice(k, k + n); }, 22) === null);
var h4 = SS.wavBasligi(function (k, n) { var b = wav([1], { extensible: true, bit: 24 }); return b.slice(k, k + n); }, wav([1], { extensible: true, bit: 24 }).length);
ok("wavBasligi: WAVE_FORMAT_EXTENSIBLE alt biçimi okunur", h4 && h4.bicim === 1 && h4.bit === 24, JSON.stringify(h4));

/* ---------- tepe ölçümü ---------- */
var sinyal16 = sinyal(5000, 9000);
sinyal16[1] = -31000;                                   // örnek 1: bayt 2..3
var beklenen16 = 31000 / 32768;
var dosya16 = wav(sinyal16, { list: true });
var tam = SS.dosyaTepesi(sahteFs(dosya16), "x.wav");
ok("dosyaTepesi: 16 bit tepe |s| / 32768 (negatif örnek)", tam && Math.abs(tam.tepe - beklenen16) < 1e-12 && tam.ornek === 5000 && tam.tam === true, tam && tam.tepe);
var sinirKotu = [];
[1, 3, 5, 7, 4097].forEach(function (parca) {
  var r = SS.dosyaTepesi(sahteFs(dosya16), "x.wav", { parca: parca });
  if (!r || Math.abs(r.tepe - beklenen16) > 1e-12 || r.ornek !== 5000) sinirKotu.push(parca + ":" + (r && r.tepe) + "/" + (r && r.ornek));
});
ok("parça sınırı: tek bayt / 3 / 5 / 7 baytlık parçalarda örnek bölünse de tepe ve örnek sayısı aynı", sinirKotu.length === 0, sinirKotu.join(" "));
// 24 bit: 1 MB (1048576) 3'e bölünmez -> 349525. örnek gerçek 1 MB sınırına düşer
var sinyal24 = sinyal(400000, 200000, 7);
sinyal24[349525] = 8000000;
var dosya24 = wav(sinyal24, { bit: 24 });
var fs24 = sahteFs(dosya24);
var r24 = SS.dosyaTepesi(fs24, "x.wav");
ok("parça sınırı: 24 bit, tepe örneği gerçek 1 MB parça sınırında", r24 && Math.abs(r24.tepe - 8000000 / 8388608) < 1e-12 && r24.ornek === 400000, r24 && r24.tepe);
ok("okuma 1 MB parçalarla (fs.readSync)", fs24.okumalar.indexOf(1048576) !== -1 && fs24.okumalar.every(function (n) { return n <= 1048576; }) && fs24.kapandi === 1, fs24.okumalar.slice(-3).join(","));
var r32 = SS.dosyaTepesi(sahteFs(wav([0, -2147483648, 5], { bit: 32 })), "x.wav");
ok("32 bit tamsayı: tam ölçek negatif örnek 1.0", r32 && r32.tepe === 1, r32 && r32.tepe);
var rF = SS.dosyaTepesi(sahteFs(wav([0, 0.25, -0.5, 0.0004], { bicim: 3, bit: 32 })), "x.wav");
ok("32 bit kayan nokta", rF && Math.abs(rF.tepe - 0.5) < 1e-7, rF && rF.tepe);
var r8 = SS.dosyaTepesi(sahteFs(wav([0, -64, 32], { bit: 8 })), "x.wav");
ok("8 bit işaretsiz (128 = sıfır)", r8 && r8.tepe === 0.5, r8 && r8.tepe);
ok("WAV değilse dosyaTepesi null", SS.dosyaTepesi(sahteFs(Buffer.from("ID3\u0004xxxxxxxxxxxxxxxxxxxx")), "x.mp3") === null);
// stereo: kanalların en büyüğü
var rSt = SS.dosyaTepesi(sahteFs(wav([10, -20, 30, -16384], { kanal: 2 })), "x.wav");
ok("stereo: tüm kanalların tepesi", rSt && rSt.tepe === 0.5, rSt && rSt.tepe);

/* ---------- eşik ---------- */
ok("eşik 0,001 (~ -60 dBFS)", SS.ESIK === 0.001 && Math.abs(SS.dbfs(0.001) + 60) < 1e-9 && SS.dbfs(0) === -Infinity);
ok("sessizMi: sınırda eşit değer sessiz DEĞİL, hemen altı sessiz", !SS.sessizMi(0.001) && SS.sessizMi(0.000999) && SS.sessizMi(0) && !SS.sessizMi(0.5));
ok("sessizMi: bilinmeyen tepe (NaN/null) sessiz sayılmaz", !SS.sessizMi(NaN) && !SS.sessizMi(null) && !SS.sessizMi(undefined));
var t32 = SS.dosyaTepesi(sahteFs(wav([0, 32, -32, 7])), "x.wav").tepe;
var t33 = SS.dosyaTepesi(sahteFs(wav([0, 32, -33, 7])), "x.wav").tepe;
ok("16 bit sınır: |s| = 32 (0,000977) sessiz, |s| = 33 (0,001007) değil", SS.sessizMi(t32) && !SS.sessizMi(t33), t32 + " / " + t33);
ok("tam sıfır dosya sessiz", SS.sessizMi(SS.dosyaTepesi(sahteFs(wav(new Array(3000).fill(0))), "x.wav").tepe));

/* ---------- erken durma ---------- */
var yuksek = sinyal(1600000, 20000, 3);               // ~3,2 MB
var fsY = sahteFs(wav(yuksek));
var rY = SS.dosyaTepesi(fsY, "x.wav", { esik: SS.ESIK });
var veriOkuma = fsY.okumalar.filter(function (n) { return n === 1048576; }).length;
ok("esik verilirse normal seste ilk parçada durur (tam: false)", rY && rY.tam === false && rY.tepe >= SS.ESIK && veriOkuma === 1, veriOkuma);
var sessizUzun = sinyal(1600000, 20, 4);
var rS = SS.dosyaTepesi(sahteFs(wav(sessizUzun)), "x.wav", { esik: SS.ESIK });
ok("sessiz dosya sonuna kadar okunur", rS && rS.tam === true && SS.sessizMi(rS.tepe) && rS.ornek === 1600000, rS && rS.ornek);

/* ---------- async ---------- */
okAsync("dosyaTepesiAsync: senkron ölçümle aynı (24 bit, 1 MB sınırı)", SS.dosyaTepesiAsync(sahteFs(dosya24), "x.wav"), function (r) {
  return r && r.tepe === r24.tepe && r.ornek === r24.ornek && r.tam === true ? true : JSON.stringify(r);
});
okAsync("dosyaTepesiAsync: WAV değilse null", SS.dosyaTepesiAsync(sahteFs(Buffer.from("not a wav file at all")), "x"), function (r) { return r === null ? true : r; });
// gerçek dosya sistemi (Node fs)
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-sessiz-"));
var gercekYol = path.join(tmp, "cap_1.wav");
fs.writeFileSync(gercekYol, wav(sinyal(40000, 15, 9), { list: true }));
okAsync("gerçek fs: 16 kHz mono sessiz WAV (LIST parçalı) sessiz bulunur", SS.dosyaTepesiAsync(fs, gercekYol, { esik: SS.ESIK }), function (r) {
  return r && SS.sessizMi(r.tepe) && r.ornek === 40000 ? true : JSON.stringify(r);
});

/* ---------- volumedetect (bulut MP3'ü) ---------- */
var vd = "[Parsed_volumedetect_0 @ 0x55d] n_samples: 160000\n[Parsed_volumedetect_0 @ 0x55d] mean_volume: -91.0 dB\n[Parsed_volumedetect_0 @ 0x55d] max_volume: -60.0 dB\n";
ok("volumedetectTepe: -60 dB -> 0,001", Math.abs(SS.volumedetectTepe(vd) - 0.001) < 1e-12);
ok("volumedetectTepe: -inf dB -> 0 (dijital sessizlik)", SS.volumedetectTepe("max_volume: -inf dB") === 0);
ok("volumedetectTepe: 0 dB -> 1, satır yoksa NaN", SS.volumedetectTepe("max_volume: 0.0 dB") === 1 && isNaN(SS.volumedetectTepe("size=  12kB")));
ok("volumedetectTepe: -61,5 dB sessiz, -59 dB değil", SS.sessizMi(SS.volumedetectTepe("max_volume: -61.5 dB")) && !SS.sessizMi(SS.volumedetectTepe("max_volume: -59.0 dB")));

/* ---------- denetle akışı ---------- */
var soruldu = 0;
okAsync("denetle: normal seste sorulmaz, devam", SS.denetle({ tepe: 0.3, onay: function () { soruldu++; return false; } }), function (d) {
  return !d.sessiz && d.devam && !d.soruldu && soruldu === 0 ? true : JSON.stringify(d);
});
okAsync("denetle: tepe ölçülemediyse (NaN) sorulmaz, devam", SS.denetle({ tepe: NaN, onay: function () { soruldu++; return false; } }), function (d) {
  return d.devam && !d.sessiz && soruldu === 0 ? true : JSON.stringify(d);
});
var gelenBilgi = null;
okAsync("denetle: sessizde 'Yine de devam et' -> motor çalışır (koruma atlanır)", SS.denetle({ tepe: 0.0002, onay: function (b) { gelenBilgi = b; return Promise.resolve(true); } }), function (d) {
  return d.sessiz && d.devam && d.soruldu && gelenBilgi && gelenBilgi.esik === 0.001 && Math.round(gelenBilgi.dbfs) === -74 ? true : JSON.stringify([d, gelenBilgi]);
});
okAsync("denetle: sessizde 'Vazgeç' -> devam yok", SS.denetle({ tepe: 0, onay: function () { return false; } }), function (d) {
  return d.sessiz && d.devam === false && d.soruldu ? true : JSON.stringify(d);
});
var karar = {}, soru = 0;
var toplu = SS.denetle({ tepe: 0.0001, karar: karar, onay: function () { soru++; return true; } }).then(function (d1) {
  return SS.denetle({ tepe: 0, karar: karar, onay: function () { soru++; return false; } }).then(function (d2) { return [d1, d2]; });
});
okAsync("denetle: toplu işte bir kez sorulur, sonraki sessiz klip aynı kararı alır", toplu, function (r) {
  return soru === 1 && r[0].devam && r[1].devam && !r[1].soruldu && karar.devam === true ? true : JSON.stringify([r, soru]);
});

/* ---------- captions.js bağlantısı ---------- */
var KOK = path.join(__dirname, "..");
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
function fnGovde(src, imza) { var i = src.indexOf(imza); return i < 0 ? "" : src.slice(i, src.indexOf("\n  }\n", i) + 4); }
var goG = fnGovde(cap, "async function go(");
var tekYol = goG.slice(goG.indexOf("var onbMeta"), goG.length);
ok("go(): tek klip/sekans yolunda denetim transcribeSuflo'dan ÖNCE (yerel ve bulut yüklemesi)",
  /if \(!ornek && !\(await sessizDenetim\(audioSrc, \{ klip: scope === "clip" \}\)\)\) throw vazgecHatasi\(\);/.test(goG) &&
  goG.indexOf("sessizDenetim(audioSrc") < goG.indexOf("transcribeSuflo(audioSrc") && tekYol.indexOf("sessizDenetim") === -1);
ok("go(): rehberin örnek klibi denetlenmez (!ornek)", /!ornek && !\(await sessizDenetim/.test(goG));
ok("go(): toplu klipte her klip ses hazırlanınca, transkripsiyondan önce; tek karar, sessiz klip atlanır",
  goG.indexOf("sessizDenetim(ba, { klip: true, karar: sessizKarar, etiket: bc.name, toplu: { sira: bi + 1, toplam: batchClips.length } })") > goG.indexOf("convertAudio(bc.mediaPath") &&
  goG.indexOf("sessizDenetim(ba,") < goG.indexOf("transcribeSuflo(ba,") && /sessizAtlanan\.push\(bc\.name\);\s*continue;/.test(goG));
ok("go(): Vazgeç hata değil uyarı", /if \(e && \(e\.vazgecildi \|\| e\.uyari\)\) status\(e\.message, "warn"\);/.test(goG));
// İnceleme: Vazgeç (ya da başka hata) ekrandaki belgeyi bırakır; algılanan dili de geri gelir
var goCatch = goG.slice(goG.lastIndexOf("} catch (e) {"), goG.lastIndexOf("} finally {"));
ok("go(): algılanan dil temizlenmeden önce saklanır, hata/Vazgeç'te geri yüklenir",
  goG.indexOf("var belgeDili = algilananDil") !== -1 && goG.indexOf("var belgeDili = algilananDil") < goG.indexOf("algilananDil = \"\";") &&
  goG.indexOf("algilananDil = \"\";") < goG.indexOf("sessizDenetim(") && /if \(!yeniBelge\) algilananDil = belgeDili;/.test(goCatch) &&
  goG.indexOf("yeniBelge = true;") > goG.indexOf("throw new Error(\"Konuşma bulunamadı.\");"));
// İnceleme: yalnız ses etiketinden oluşan transkript kırmızı hata değil, ayara yönlendiren uyarı
var bosG = goG.slice(goG.indexOf("if (segments.length === 0) {"), goG.indexOf("throw new Error(\"Konuşma bulunamadı.\");"));
ok("go(): satırlar yalnız etiket filtresiyle boşaldıysa uyarı (e.uyari) ve Ayarlar › Altyazı › Ses etiketlerini koru",
  /if \(yalnizEtiketMi\(mapped, lenVal\)\)/.test(bosG) && /eEt\.uyari = true;/.test(bosG) && bosG.indexOf("durumYukle(oncekiIs)") < bosG.indexOf("yalnizEtiketMi") &&
  cap.indexOf("Etiketleri altyazıda tutmak için: Ayarlar › Altyazı › Ses etiketlerini koru.") !== -1);
var twG = cap.slice(cap.indexOf("async function transcribeWords"), cap.indexOf("function applyGlossary"));
ok("transcribeWords (Konuşmadan kes): denetim transcribeSuflo'dan önce, uyarı kendi kutusunda",
  twG.indexOf("sessizDenetim(audio, { klip: true, kutu: opts.sessizKutu || \"cap-sessiz\" })") > 0 &&
  twG.indexOf("sessizDenetim(audio,") < twG.indexOf("transcribeSuflo(audio,"));
var kk = fs.readFileSync(path.join(KOK, "js", "konusma-kes.js"), "utf8");
ok("Konuşmadan kes: uyarı #tc-sessiz'de, Vazgeç uyarı olarak", /sessizKutu: "tc-sessiz"/.test(kk) && /if \(e && e\.vazgecildi\) status\(e\.message, "warn"\);/.test(kk));
var ca = fnGovde(cap, "async function convertAudio(");
ok("convertAudio: bulut MP3'ünde tepe aynı geçişte volumedetect ile ölçülür", /"-af", SESSIZ_OLCUM_ZINCIRI, "-b:a", br/.test(ca) && /SSES\.volumedetectTepe\(r\.stderr\)/.test(ca) &&
  !/SESSIZ_OLCUM_ZINCIRI|volumedetect"/.test(ca.slice(ca.indexOf("if (wav) {"), ca.indexOf("} else {", ca.indexOf("if (wav) {")))) && /"-ac", "1", "-ar", "16000"/.test(ca));
// İnceleme: ffmpeg -af zincirini -ac/-ar dönüşümünden ÖNCE çalıştırır; ölçüm yüklenen mono 16 kHz sesle aynı olmalı
var zincirM = /var SESSIZ_OLCUM_ZINCIRI = "([^"]+)";/.exec(cap);
var zincir = zincirM ? zincirM[1] : "";
ok("volumedetect zinciri: önce mono + 16 kHz aformat, sonra volumedetect",
  /^aformat=[^,]*sample_rates=16000/.test(zincir) && /^aformat=[^,]*channel_layouts=mono/.test(zincir) && /,volumedetect$/.test(zincir) &&
  zincir.indexOf("aformat") < zincir.indexOf("volumedetect"), zincir);
// Gerçek ffmpeg (varsa): convertAudio'nun bulut argümanlarıyla. Ters fazlı stereo (ters bağlanmış yaka
// mikrofonu) mono'da birbirini siler: yüklenen MP3 gibi "sessiz" ölçülmeli. Her durumda ölçüm yüklenen
// dosyayla aynı kararı vermeli (eski zincir kaynağın tepesini ölçüyordu)
(function () {
  var cp = require("child_process");
  var var1 = cp.spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8" });
  if (var1.error || var1.status !== 0 || !/libmp3lame/.test(var1.stdout || "")) { console.log("ATLA gerçek ffmpeg volumedetect: libmp3lame'li ffmpeg yok"); return; }
  function stereo(oran, frekans, ters) {
    var n = oran * 1, o = [];
    for (var i = 0; i < n; i++) { var v = Math.round(12000 * Math.sin(2 * Math.PI * frekans * i / oran)); o.push(v, ters ? -v : v); }
    return wav(o, { kanal: 2, oran: oran });
  }
  function olc(buf, ad) {
    var giris = path.join(tmp, ad + ".wav"), cikis = path.join(tmp, ad + ".mp3");
    fs.writeFileSync(giris, buf);
    var r = cp.spawnSync("ffmpeg", ["-y", "-i", giris, "-vn", "-ac", "1", "-ar", "16000", "-af", zincir, "-b:a", "64k", cikis], { encoding: "utf8" });
    var sonra = cp.spawnSync("ffmpeg", ["-hide_banner", "-i", cikis, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    return { tepe: SS.volumedetectTepe(r.stderr), dosya: SS.volumedetectTepe(sonra.stderr) };
  }
  var ters = olc(stereo(48000, 440, true), "vd_ters"), tiz = olc(stereo(48000, 10000, false), "vd_tiz"), normal = olc(stereo(48000, 440, false), "vd_normal");
  ok("gerçek ffmpeg: ters fazlı stereo (mono'da sessiz) sessiz ölçülür, yüklenen MP3 ile aynı karar",
    SS.sessizMi(ters.tepe) && SS.sessizMi(ters.dosya), JSON.stringify(ters));
  ok("gerçek ffmpeg: tiz (10 kHz) içerikte ölçüm yeniden örneklenmiş sesi izler (kaynağın tepesi değil)",
    isFinite(tiz.tepe) && isFinite(tiz.dosya) && Math.abs(20 * Math.log(tiz.tepe / tiz.dosya) / Math.LN10) < 3 && SS.sessizMi(tiz.tepe) === SS.sessizMi(tiz.dosya), JSON.stringify(tiz));
  ok("gerçek ffmpeg: normal stereo konuşma bandı sessiz sayılmaz", !SS.sessizMi(normal.tepe) && normal.tepe > 0.1, JSON.stringify(normal));
})();
ok("uyarı metni: spesifikasyondaki cümle", cap.indexOf("Ses neredeyse tamamen sessiz: ses kanalları kapalı ya da sessize alınmış olabilir") !== -1);

// sessizDenetim + sessizOnay davranışı (sahte DOM ve K ile)
function sahteSekme(id, acik) {
  var sinif = { tabpane: true, active: !!acik };
  return { id: id, parentNode: null, classList: { contains: function (c) { return !!sinif[c]; } }, ac: function () { sinif.active = true; } };
}
function sahteEl(o) {
  o = o || {};
  var d = {};
  var sekmeler = { cap: sahteSekme("tab-captions", o.capAcik !== false), tc: sahteSekme("tab-cut", o.tcAcik !== false) };
  ["cap-sessiz", "cap-sessiz-devam", "cap-sessiz-vazgec", "cap-sessiz-metin", "tc-sessiz", "tc-sessiz-devam", "tc-sessiz-vazgec", "tc-sessiz-metin",
    "cap-progress", "tc-progress"].forEach(function (id) {
    d[id] = { id: id, hidden: /-sessiz$/.test(id), textContent: "", onclick: null, focus: function () { d.odak = id; }, scrollIntoView: function () {},
      parentNode: /-sessiz$/.test(id) ? sekmeler[id.split("-")[0]] : null };
  });
  d.sekmeler = sekmeler;
  return d;
}
function baglanti(o) {
  o = o || {};
  var dom = sahteEl(o), loglar = [], durumlar = [], mp3 = {}, bildirimler = [], gidilen = [];
  if (o.ilerleme) { dom["cap-progress"].hidden = false; dom["tc-progress"].hidden = false; }
  var K = { nodeOK: true, fs: fs, log: function (m) { loglar.push(m); } };
  var KApp = o.kappYok ? undefined : {
    toast: function (m, tur, sure, eylem) { bildirimler.push({ m: m, tur: tur, sure: sure, eylem: eylem }); },
    goster: function (ad) { gidilen.push(ad); var s = dom.sekmeler[ad === "captions" ? "cap" : "tc"]; if (s) s.ac(); }
  };
  var kod = fnGovde(cap, "function vazgecHatasi(") + fnGovde(cap, "function sessizTopluMetni(") + fnGovde(cap, "function sessizSekmesi(") +
    fnGovde(cap, "function sessizOnay(") + fnGovde(cap, "async function sessizDenetim(") +
    "\nreturn { sessizDenetim: sessizDenetim, vazgecHatasi: vazgecHatasi, sessizTopluMetni: sessizTopluMetni };";
  var api = new Function("SSES", "K", "KApp", "el", "status", "mp3Tepeleri", "SESSIZ_KLIP", "SESSIZ_SEKANS", kod)(
    SS, K, KApp, function (id) { return dom[id] || null; }, function (m) { durumlar.push(m); }, mp3, "KLIP-METNI", "SEKANS-METNI");
  return { api: api, dom: dom, loglar: loglar, mp3: mp3, durumlar: durumlar, bildirimler: bildirimler, gidilen: gidilen };
}
var sessizYol = path.join(tmp, "cap_sessiz.wav"), sesliYol = path.join(tmp, "cap_sesli.wav");
fs.writeFileSync(sessizYol, wav(sinyal(16000, 10, 5)));
fs.writeFileSync(sesliYol, wav(sinyal(16000, 12000, 6)));
function sonraki() { return new Promise(function (r) { setTimeout(r, 20); }); }

var b1 = baglanti();
var p1 = b1.api.sessizDenetim(sessizYol, { klip: true });
okAsync("panel: sessiz WAV'da kutu açılır (klip metni); 'Yine de devam et' -> true, kutu kapanır, günlüğe yazılır", sonraki().then(function () {
  var acik = b1.dom["cap-sessiz"].hidden === false && b1.dom["cap-sessiz-metin"].textContent === "KLIP-METNI";
  b1.dom["cap-sessiz-devam"].onclick();
  return p1.then(function (devam) { return [acik, devam]; });
}), function (r) {
  return r[0] && r[1] === true && b1.dom["cap-sessiz"].hidden === true && b1.loglar.some(function (l) { return /tepe .* dBFS\) < 0\.001/.test(l); }) &&
    b1.loglar.some(function (l) { return /karari: devam/.test(l); }) ? true : JSON.stringify([r, b1.loglar]);
});
var b2 = baglanti();
var p2 = b2.api.sessizDenetim(sessizYol, { klip: false, kutu: "tc-sessiz" });
okAsync("panel: 'Vazgeç' -> false; kutu verilen sekmede (tc-sessiz), sekans metni", sonraki().then(function () {
  var acik = b2.dom["tc-sessiz"].hidden === false && b2.dom["cap-sessiz"].hidden === true && b2.dom["tc-sessiz-metin"].textContent === "SEKANS-METNI";
  b2.dom["tc-sessiz-vazgec"].onclick();
  return p2.then(function (devam) { return [acik, devam]; });
}), function (r) { return r[0] && r[1] === false && b2.dom["tc-sessiz"].hidden === true ? true : JSON.stringify(r); });
var b3 = baglanti();
okAsync("panel: sesli WAV'da soru yok, kutu kapalı kalır", b3.api.sessizDenetim(sesliYol, {}), function (d) {
  return d === true && b3.dom["cap-sessiz"].hidden === true && !b3.loglar.length ? true : JSON.stringify([d, b3.loglar]);
});
var b4 = baglanti();
b4.mp3["/tmp/cap_9.mp3"] = 0;
var p4 = b4.api.sessizDenetim("/tmp/cap_9.mp3", {});
okAsync("panel: bulut MP3'ü volumedetect tepesiyle denetlenir (yükleme öncesi), ölçüm bir kez kullanılır", sonraki().then(function () {
  var acik = b4.dom["cap-sessiz"].hidden === false;
  b4.dom["cap-sessiz-vazgec"].onclick();
  return p4.then(function (d) { return [acik, d]; });
}), function (r) { return r[0] && r[1] === false && !("/tmp/cap_9.mp3" in b4.mp3) ? true : JSON.stringify(r); });
var b5 = baglanti();
okAsync("panel: ölçülemeyen ses (yok/okunamaz) engellemez", b5.api.sessizDenetim(path.join(tmp, "yok.wav"), {}), function (d) {
  return d === true && b5.loglar.some(function (l) { return /olculemedi/.test(l); }) ? true : JSON.stringify([d, b5.loglar]);
});
// İnceleme: toplu işte soru klibin adını ve sırasını söyler, durum satırı silinmez, karar sonrakilere de uygulanır
var b6 = baglanti(), karar6 = {};
var p6 = b6.api.sessizDenetim(sessizYol, { klip: true, karar: karar6, etiket: "B-roll 3", toplu: { sira: 2, toplam: 6 } });
okAsync("toplu: soru klip adını ve i/N sırasını söyler, kararın sonraki sessiz kliplere uygulandığını belirtir; durum satırı silinmez", sonraki().then(function () {
  var metin = b6.dom["cap-sessiz-metin"].textContent;
  b6.dom["cap-sessiz-vazgec"].onclick();
  return p6.then(function (d) { return [metin, d]; });
}), function (r) {
  return r[1] === false && r[0].indexOf("klip 2/6 (B-roll 3)") !== -1 && /sonraki sessiz kliplere de uygulanır/.test(r[0]) && r[0] !== "KLIP-METNI" &&
    b6.durumlar.indexOf("") === -1 && karar6.devam === false ? true : JSON.stringify([r, b6.durumlar]);
});
var b6b = baglanti();
var p6b = b6b.api.sessizDenetim(sessizYol, { klip: true });
okAsync("tek klip: durum satırı temizlenir (eski davranış), metin tek klip metni", sonraki().then(function () {
  var metin = b6b.dom["cap-sessiz-metin"].textContent;
  b6b.dom["cap-sessiz-devam"].onclick();
  return p6b.then(function () { return metin; });
}), function (m) { return m === "KLIP-METNI" && b6b.durumlar.indexOf("") !== -1 ? true : JSON.stringify([m, b6b.durumlar]); });
ok("sessizTopluMetni: en.js kalıbı klip adını çevirmeden İngilizceye taşır", (function () {
  var I = require(path.join(KOK, "js", "i18n.js"));
  I.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  var tr = baglanti().api.sessizTopluMetni(2, 6, "Altyazı");
  var en = I.translate(tr);
  return en !== tr && en.indexOf("clip 2/6 (Altyazı)") !== -1 && !/sessiz|klip/.test(en.replace("Altyazı", "")) ? true : en;
})() === true);

// İnceleme: cevap beklenirken ilerleme çubuğu durur; kutunun sekmesi kapalıysa uyarı bildirimi ve "Uyarıyı göster"
var b7 = baglanti({ ilerleme: true, tcAcik: false });
var p7 = b7.api.sessizDenetim(sessizYol, { klip: false, kutu: "tc-sessiz" });
okAsync("gizli sekmede soru: ilerleme gizlenir, uzun uyarı bildirimi çıkar, 'Uyarıyı göster' sekmeye götürür; cevaptan sonra ilerleme geri gelir", sonraki().then(function () {
  var bekler = { tcIlerleme: b7.dom["tc-progress"].hidden, capIlerleme: b7.dom["cap-progress"].hidden, bildirim: b7.bildirimler.slice() };
  var eylem = b7.bildirimler[0] && b7.bildirimler[0].eylem;
  if (eylem) eylem.fn();
  bekler.gidilen = b7.gidilen.slice();
  bekler.odak = b7.dom.odak;
  b7.dom["tc-sessiz-devam"].onclick();
  return p7.then(function (d) { bekler.d = d; bekler.sonra = b7.dom["tc-progress"].hidden; return bekler; });
}), function (r) {
  var bl = r.bildirim[0];
  return r.tcIlerleme === true && r.capIlerleme === false && r.bildirim.length === 1 && bl.m === "SEKANS-METNI" && bl.tur === "warn" && bl.sure >= 15000 &&
    bl.eylem && bl.eylem.metin === "Uyarıyı göster" && r.gidilen.join() === "cut" && r.odak === "tc-sessiz-vazgec" && r.d === true && r.sonra === false
    ? true : JSON.stringify(r);
});
var b8 = baglanti({ ilerleme: true });
var p8 = b8.api.sessizDenetim(sessizYol, { klip: true });
okAsync("açık sekmede soru: bildirim yok (kutu zaten görünür); Vazgeç'ten sonra ilerleme yine görünür (iş setBusy ile kapanır)", sonraki().then(function () {
  var gizli = b8.dom["cap-progress"].hidden;
  b8.dom["cap-sessiz-vazgec"].onclick();
  return p8.then(function (d) { return [gizli, d, b8.bildirimler.length, b8.dom["cap-progress"].hidden]; });
}), function (r) { return r[0] === true && r[1] === false && r[2] === 0 && r[3] === false ? true : JSON.stringify(r); });
var b9 = baglanti({ kappYok: true, capAcik: false });
var p9 = b9.api.sessizDenetim(sessizYol, { klip: true });
okAsync("KApp yoksa (test/eski yükleme sırası) soru yine çalışır", sonraki().then(function () {
  b9.dom["cap-sessiz-devam"].onclick();
  return p9;
}), function (d) { return d === true ? true : JSON.stringify(d); });

// İnceleme: satırlar yalnız etiket filtresiyle boşaldıysa (ayar kapalı) uyarı; konuşmasız gerçek boşlukta değil
var CTm = require(path.join(KOK, "js", "caption-text.js"));
function yalnizEtiket(koruAyari) {
  return new Function("CT", "sesEtiketKoru", fnGovde(cap, "function yalnizEtiketMi(") + "\nreturn yalnizEtiketMi;")(CTm, function () { return koruAyari; });
}
var yalnizMuzik = [{ start: 0, end: 5, text: "[Müzik]" }, { start: 5, end: 9, text: "(alkış)" }];
ok("yalnizEtiketMi: yalnız etiket + ayar kapalı -> true; ayar açık, boş ya da konuşmasız noktalama -> false",
  yalnizEtiket(false)(yalnizMuzik, "c42") === true && yalnizEtiket(false)(yalnizMuzik, "k1") === true && yalnizEtiket(false)(yalnizMuzik, "w3") === true &&
  yalnizEtiket(true)(yalnizMuzik, "c42") === false && yalnizEtiket(false)([], "c42") === false &&
  yalnizEtiket(false)([{ start: 0, end: 1, text: "..." }, { start: 1, end: 2, text: "[BLANK_AUDIO]" }], "c42") === false &&
  CTm.segmentleriKur(yalnizMuzik, "c42", {}).segments.length === 0);

var vh = baglanti().api.vazgecHatasi();
ok("vazgecHatasi: işaretli hata", vh.vazgecildi === true && /Vazgeçildi/.test(vh.message));

Promise.all(bekleyen).then(function () {
  try { fs.readdirSync(tmp).forEach(function (f) { fs.unlinkSync(path.join(tmp, f)); }); fs.rmdirSync(tmp); } catch (e) {}
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
});
