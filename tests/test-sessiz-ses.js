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
  goG.indexOf("sessizDenetim(ba, { klip: true, karar: sessizKarar, etiket: bc.name })") > goG.indexOf("convertAudio(bc.mediaPath") &&
  goG.indexOf("sessizDenetim(ba,") < goG.indexOf("transcribeSuflo(ba,") && /sessizAtlanan\.push\(bc\.name\);\s*continue;/.test(goG));
ok("go(): Vazgeç hata değil uyarı", /if \(e && e\.vazgecildi\) status\(e\.message, "warn"\);/.test(goG));
var twG = cap.slice(cap.indexOf("async function transcribeWords"), cap.indexOf("function applyGlossary"));
ok("transcribeWords (Konuşmadan kes): denetim transcribeSuflo'dan önce, uyarı kendi kutusunda",
  twG.indexOf("sessizDenetim(audio, { klip: true, kutu: opts.sessizKutu || \"cap-sessiz\" })") > 0 &&
  twG.indexOf("sessizDenetim(audio,") < twG.indexOf("transcribeSuflo(audio,"));
var kk = fs.readFileSync(path.join(KOK, "js", "konusma-kes.js"), "utf8");
ok("Konuşmadan kes: uyarı #tc-sessiz'de, Vazgeç uyarı olarak", /sessizKutu: "tc-sessiz"/.test(kk) && /if \(e && e\.vazgecildi\) status\(e\.message, "warn"\);/.test(kk));
var ca = fnGovde(cap, "async function convertAudio(");
ok("convertAudio: bulut MP3'ünde tepe aynı geçişte volumedetect ile ölçülür", /"-af", "volumedetect", "-b:a", br/.test(ca) && /SSES\.volumedetectTepe\(r\.stderr\)/.test(ca) &&
  !/"-af", "volumedetect"/.test(ca.slice(ca.indexOf("if (wav) {"), ca.indexOf("} else {", ca.indexOf("if (wav) {")))));
ok("uyarı metni: spesifikasyondaki cümle", cap.indexOf("Ses neredeyse tamamen sessiz: ses kanalları kapalı ya da sessize alınmış olabilir") !== -1);

// sessizDenetim + sessizOnay davranışı (sahte DOM ve K ile)
function sahteEl() {
  var d = {};
  ["cap-sessiz", "cap-sessiz-devam", "cap-sessiz-vazgec", "cap-sessiz-metin", "tc-sessiz", "tc-sessiz-devam", "tc-sessiz-vazgec", "tc-sessiz-metin"].forEach(function (id) {
    d[id] = { id: id, hidden: /-sessiz$/.test(id), textContent: "", onclick: null, focus: function () {}, scrollIntoView: function () {} };
  });
  return d;
}
function baglanti() {
  var dom = sahteEl(), loglar = [], durumlar = [], mp3 = {};
  var K = { nodeOK: true, fs: fs, log: function (m) { loglar.push(m); } };
  var kod = fnGovde(cap, "function vazgecHatasi(") + fnGovde(cap, "function sessizOnay(") + fnGovde(cap, "async function sessizDenetim(") +
    "\nreturn { sessizDenetim: sessizDenetim, vazgecHatasi: vazgecHatasi };";
  var api = new Function("SSES", "K", "el", "status", "mp3Tepeleri", "SESSIZ_KLIP", "SESSIZ_SEKANS", kod)(
    SS, K, function (id) { return dom[id] || null; }, function (m) { durumlar.push(m); }, mp3, "KLIP-METNI", "SEKANS-METNI");
  return { api: api, dom: dom, loglar: loglar, mp3: mp3 };
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
var vh = baglanti().api.vazgecHatasi();
ok("vazgecHatasi: işaretli hata", vh.vazgecildi === true && /Vazgeçildi/.test(vh.message));

Promise.all(bekleyen).then(function () {
  try { fs.readdirSync(tmp).forEach(function (f) { fs.unlinkSync(path.join(tmp, f)); }); fs.rmdirSync(tmp); } catch (e) {}
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
});
