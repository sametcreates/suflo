/* Yeni stil motoru: eski captions.js motorundan bagimsiz, dogrudan test edilir. */
var fs = require("fs");
var os = require("os");
var path = require("path");
var cp = require("child_process");
var root = path.join(__dirname, "..");
var engine = require(path.join(root, "js", "style-engine.js"));

var passed = 0, failed = 0;
function ok(name, condition, proof) {
  if (condition) { passed++; console.log("PASS " + name + (proof ? "   [" + proof + "]" : "")); }
  else { failed++; console.log("FAIL " + name + "   [" + String(proof || "?").slice(0, 200) + "]"); }
}

var styles = engine.list();
// 3.3: arayüzde tek temel stil "efekt" (Altyazı Efektleri); 12 eski stil kayıtlar ve SFL1 kodları için kalır
var ESKI = ["mrbeast", "capcut", "saas", "viral", "pop", "doc", "premium", "hormozi", "neon", "daktilo", "ziplama", "dolgu"];
var eskiStiller = styles.filter(function (s) { return ESKI.indexOf(s.id) !== -1; });
ok("motor v3 etkin", engine.version === 3, engine.version);
ok("13 bagimsiz stil var (7 klasik + 5 v3.0 + Altyazı Efektleri)", styles.map(function (s) { return s.id; }).join(",") ===
  ESKI.join(",") + ",efekt",
  styles.map(function (s) { return s.id; }).join(","));
ok("has(): bilinen/bilinmeyen stil", engine.has("neon") && !engine.has("yok"));

var expectedFonts = {
  mrbeast: ["ArchivoBlack.ttf", "OFL-ArchivoBlack.txt"],
  capcut: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"],
  saas: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"],
  viral: ["ArchivoBlack.ttf", "OFL-ArchivoBlack.txt"],
  pop: ["Bungee.ttf", "OFL-Bungee.txt"],
  doc: ["Lora.ttf", "OFL-Lora.txt"],
  premium: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"],
  hormozi: ["Anton.ttf", "OFL-Anton.txt"],
  neon: ["BebasNeue.ttf", "OFL-BebasNeue.txt"],
  daktilo: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"],
  ziplama: ["ArchivoBlack.ttf", "OFL-ArchivoBlack.txt"],
  dolgu: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"],
  efekt: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"]
};
Object.keys(expectedFonts).forEach(function (id) {
  expectedFonts[id].forEach(function (file) {
    ok(id + " dosyasi: " + file, fs.existsSync(path.join(root, "fonts", file)), file);
  });
});

var words = ["BUNU", "GOREN", "HERKES", "SASIRDI"];
var wordCues = words.map(function (word, i) {
  return { start: i * 0.55, end: i * 0.55 + 0.48, text: word };
});
var docCues = [{ start: 0, end: 2.5, text: "Hikâyenin başladığı yer, İstanbul'du." }];
var compiled = {};
styles.map(function (s) { return s.id; }).forEach(function (id) {
  compiled[id] = engine.compile({ styleId: id, cues: id === "doc" ? docCues : wordCues, width: 1280, height: 720 });
  ok(id + " ASS olay uretti", compiled[id].eventCount > 0, compiled[id].eventCount + " olay");
  ok(id + " Turkce metni koruyor", /BUNU|Hikâyenin/.test(compiled[id].ass));
});

ok("viral iki satir + katmanli creator kompozisyonu",
  compiled.viral.eventCount >= 14 && /\\N/.test(compiled.viral.ass) && /\\p1/.test(compiled.viral.ass), compiled.viral.eventCount);
ok("pop sticker + confetti katmanlari",
  compiled.pop.eventCount >= 28 && /\\frz-/.test(compiled.pop.ass) && /\\p1/.test(compiled.pop.ass), compiled.pop.eventCount);
ok("belgesel panel + altin cetvel + metin",
  compiled.doc.eventCount === 5 && /\\move\(/.test(compiled.doc.ass) && /\\p1/.test(compiled.doc.ass), compiled.doc.eventCount);
ok("premium sinematik panel + reveal + cizgiler",
  compiled.premium.eventCount === 5 && /\\clip\(/.test(compiled.premium.ass) && /\\p1/.test(compiled.premium.ass), compiled.premium.eventCount);
ok("creator punch mavi derinlik + sari vurgu + punch hareketi",
  compiled.mrbeast.eventCount >= 12 && /2F8CFF|FF8C2F/i.test(compiled.mrbeast.ass) && /\\t\(/.test(compiled.mrbeast.ass), compiled.mrbeast.eventCount);
ok("capcut kompakt pill + aktif kelime",
  compiled.capcut.eventCount >= 6 && /\\p1/.test(compiled.capcut.ass) && /B8FF5A|5AFFB8/i.test(compiled.capcut.ass), compiled.capcut.eventCount);
ok("saas cam panel + nokta + yumusak hareket",
  compiled.saas.eventCount >= 8 && /\\blur/.test(compiled.saas.ass) && /\\move\(/.test(compiled.saas.ass), compiled.saas.eventCount);
ok("tum stillerin ASS ciktisi birbirinden farkli", new Set(Object.keys(compiled).map(function (k) { return compiled[k].ass; })).size === styles.length);

/* ---- v3.0: satir altyazisi kelime stillerinde dogru bolunur ---- */
var satirlar = [{ start: 0, end: 1.6, text: "Bunu gören herkes şaşırdı" }, { start: 1.7, end: 3.2, text: "İstanbul çok güzel" }];
var bolunmus = engine.splitToWords(satirlar);
ok("splitToWords: 7 kelime, sure korunur", bolunmus.length === 7 && bolunmus[0].start === 0 && Math.abs(bolunmus[3].end - 1.6) < 1e-9 && bolunmus[4].start === 1.7,
  JSON.stringify(bolunmus.map(function (w) { return [w.text, +w.start.toFixed(2), +w.end.toFixed(2)]; })));
ok("splitToWords: satir sonu isaretli", bolunmus[3].lineEnd === true && !bolunmus[2].lineEnd);
var hz = engine.compile({ styleId: "hormozi", cues: satirlar, cueKind: "lines", width: 1280, height: 720 }).ass;
ok("kelime stili gruplari satir sinirini asmaz", !/şaşırdı[^\n]*İstanbul/.test(hz) && /İstanbul/.test(hz));
ok("birikimli cue'dan son kelime", engine.lastWords([{ start: 0, end: 1, text: "bir" }, { start: 1, end: 2, text: "bir iki" }])[1].text === "iki");
ok("dolgu \\kf karaoke etiketleri", /\\kf\d+/.test(compiled.dolgu.ass));
ok("neon bulanik parilti katmani", /\\blur\d/.test(compiled.neon.ass) && /\\1a&HFF&/.test(compiled.neon.ass));
ok("ziplama esneme hareketi", /\\fscx70\\fscy140/.test(compiled.ziplama.ass));

/* ---- v3.0 inceleme duzeltmeleri ---- */
var dikey = [{ start: 0, end: 2, text: "BUNU ASLA KAÇIRMAMALISIN" }];
["hormozi", "neon", "ziplama", "daktilo", "dolgu"].forEach(function (id) {
  // daktilo/dolgu 4+ kelimede boler (satir stili); digerleri 3+
  var girdi = /^(daktilo|dolgu)$/.test(id) ? [{ start: 0, end: 2, text: "Bunu asla kaçırmamalısın arkadaşlar" }] : dikey;
  var d = engine.compile({ styleId: id, cues: girdi, cueKind: "lines", width: 1080, height: 1920 }).ass;
  var fsMax = Math.max.apply(null, (d.match(/\\fs(\d+)/g) || ["\\fs0"]).map(function (x) { return Number(x.slice(3)); }));
  ok(id + " 9:16'da font kisa kenara gore (yukseklige gore buyuyup tasmaz)", fsMax > 0 && fsMax <= engine.preset(id).style.boyut, fsMax);
  ok(id + " cok kelimeli grup iki satira bolunur", /\\N/.test(d));
});
var nAss = compiled.neon.ass;
ok("neon soluk kelime \\1a ile (libass \\1c alfasini yok sayar)", /\\1a&H78&/.test(nAss));
ok("neon parilti katmani \\alpha ile dolguyu acmaz", !/\\alpha&H00&/.test(nAss.split("\n").filter(function (l) { return /^Dialogue: 0,/.test(l); }).join("\n")));
var kac = engine.compile({ styleId: "viral", cues: [{ start: 0, end: 1, text: "a\\Nb {x}" }] }).ass;
ok("kullanici metnindeki ters bolu ASS komutu olmaz", kac.indexOf("a\\Nb") === -1 && kac.indexOf("a\u29F5Nb") !== -1);

/* ---- ince ayar dogrulamasi, platform guvenli yerlesimi, degismezlik ---- */
var crypto = require("crypto");
function ozet(r) { return crypto.createHash("sha256").update(r.ass).digest("hex").slice(0, 16); }
// Degisiklik ONCESI motorla uretilen ozetler (tests/style-engine-snapshot.json): guvenli bayragi
// olmadan cikti bayt bayt ayni kalmali (12 eski stil × 16:9 / 9:16 × kelime / satir × ince ayar yok / paket / sistem fontu).
// 3.3: Altyazı Efektleri alanları ("" = stilin kendi değeri) eski stillerin çıktısını da değiştirmez.
var snap = JSON.parse(fs.readFileSync(path.join(__dirname, "style-engine-snapshot.json"), "utf8"));
var snapKelime = ["Bunu", "*gören*", "herkes", "şaşırdı", "İstanbul'da", "çok", "güzel", "bir", "gün", "vardı."].map(function (w, i) {
  return { start: i * 0.5, end: i * 0.5 + 0.44, text: w };
});
var snapSatir = [{ start: 0, end: 2.2, text: "Bunu gören herkes *şaşırdı* bugün" }, { start: 2.4, end: 4.6, text: "İstanbul çok güzel, değil mi?" }];
var snapAyar = {
  yok: null,
  ince: { font: "Lora", fontFile: "Lora.ttf", boyut: 90, renk: "#ff3366", konturRenk: "#101010", vurguRenk: "#22ccff", kontur: 3, konum: 2 },
  sistem: { font: "Arial", boyut: 72, renk: "#ffffff", konturRenk: "#000000", vurguRenk: "#8b7cf6", kontur: 4, konum: 8 }
};
var farkli = [], sayilan = 0;
eskiStiller.forEach(function (s) {
  [[1920, 1080], [1080, 1920]].forEach(function (d) {
    ["words", "lines"].forEach(function (k) {
      Object.keys(snapAyar).forEach(function (a) {
        var o = { styleId: s.id, cues: k === "words" ? snapKelime : snapSatir, cueKind: k, width: d[0], height: d[1] };
        if (snapAyar[a]) o.overrides = snapAyar[a];
        var anahtar = s.id + "@" + d[0] + "x" + d[1] + ":" + k + ":" + a;
        sayilan++;
        if (snap[anahtar] !== ozet(engine.compile(o))) farkli.push(anahtar);
        // boş giriş / vurgu animasyonu ve eski stillerde anlamsız efekt alanları: çıktı aynı
        // 3.3 adım 17: gölge, kutu, serbest konum da eski stillerde hiçbir şeyi değiştirmez
        var oe = Object.assign({}, o, { overrides: Object.assign({}, snapAyar[a] || {}, { giris: "", aktif: "", satir: 3, kelime: 2, vurgu: false,
          golge: { renk: "#ff0000", opak: 80, mesafe: 9, yumusak: 9 }, kutu: true, kutuRenk: "#00ff00", kutuOpak: 70, konumX: 20, konumY: 30 }) });
        if (snap[anahtar] !== ozet(engine.compile(oe))) farkli.push(anahtar + " +efekt");
        // guvenli bayragi 16:9'da hicbir seyi degistirmez
        if (d[0] > d[1]) {
          var og = Object.assign({}, o, { overrides: Object.assign({}, snapAyar[a] || {}, { guvenli: true }) });
          if (snap[anahtar] !== ozet(engine.compile(og))) farkli.push(anahtar + " +guvenli");
        }
      });
    });
  });
});
ok("guvenli olmadan cikti degisiklik oncesiyle bayt bayt ayni (" + sayilan + " durum) ve 16:9'da guvenli etkisiz", farkli.length === 0 && sayilan === Object.keys(snap).length,
  farkli.slice(0, 4).join(", "));

/* ---- 3.2 adim 4: Belgesel bandinin dengeli \N bolmesi altyazi iziyle ortak (js/caption-layout.js) ---- */
var seKaynak = fs.readFileSync(path.join(__dirname, "..", "js", "style-engine.js"), "utf8");
ok("balancedText, dengeliUzunluk ve breakIndex iki satir kirilimini caption-layout.js ikiyeBolNoktasi'ndan alir (eski yerel donguler yok)",
  /if \(CL && CL\.ikiyeBolNoktasi\) return CL\.ikiyeBolNoktasi\(words\);/.test(seKaynak) && /var best = ikiyeBol\(words\);/.test(seKaynak) &&
  /var i = ikiyeBol\(words\);/.test(seKaynak) && /var i = ikiyeBol\(group\.map\(/.test(seKaynak) && !/bestScore/.test(seKaynak));
// require'siz ortamda (caption-layout.js yok) yedek kural ayni kirilimi verir: Belgesel ve kelime gruplari bayt bayt ayni
var kutuSe = { module: { exports: {} }, console: console };
kutuSe.exports = kutuSe.module.exports;
require("vm").runInNewContext(seKaynak, kutuSe);
var yalinSe = kutuSe.module.exports;
ok("caption-layout.js olmadan yuklenen motor ayni Belgesel ve kelime grubu kirilimini uretir", ["doc", "capcut", "premium", "neon"].every(function (id) {
  return [[1920, 1080], [1080, 1920]].every(function (wh) {
    var o1 = { styleId: id, cues: id === "doc" ? [{ start: 0, end: 3, text: "Bugün size kamerayla ilgili birkaç şey anlatacağım ve göstereceğim" }] : snapKelime,
      cueKind: id === "doc" ? "lines" : "words", width: wh[0], height: wh[1] };
    return yalinSe.compile(o1).ass === engine.compile(o1).ass;
  });
}));
var CLm = require(path.join(__dirname, "..", "js", "caption-layout.js"));
var docUzun = "Bugün size kamerayla ilgili birkaç şey anlatacağım ve göstereceğim";
var docAss = engine.compile({ styleId: "doc", cues: [{ start: 0, end: 3, text: docUzun }], cueKind: "lines", width: 1920, height: 1080 }).ass;
var docKelime = docUzun.split(" "), docKir = CLm.ikiyeBolNoktasi(docKelime);
ok("Belgesel bandi uzun satiri altyazi iziyle (2 satir × 42) ayni kelimeden kirar",
  docAss.indexOf(docKelime.slice(0, docKir).join(" ") + "\\N" + docKelime.slice(docKir).join(" ")) !== -1 &&
  CLm.dengeliSar(docUzun, 42, 2) === docKelime.slice(0, docKir).join(" ") + "\n" + docKelime.slice(docKir).join(" "));

/* ---- Ölçülmüş kelime zamanları (yerel -ojf): cue.words sayısı tutarsa ölçülmüş geçişler ---- */
var olcuSatir = [{ start: 10, end: 13, text: "Bunu gören *herkes* şaşırdı", words: [
  { text: "Bunu", start: 10.2, end: 10.5 }, { text: "gören", start: 10.5, end: 11.4 }, { text: "herkes", start: 11.9, end: 12.3 }, { text: "şaşırdı", start: 12.35, end: 12.9 }] }];
var olcuBol = engine.splitToWords(olcuSatir);
ok("splitToWords: sayı tutunca ölçülmüş başlangıçlar (vurgu işareti sayılmaz), ilk kelime cue başında, son cue sonunda",
  olcuBol.length === 4 && olcuBol[0].start === 10 && olcuBol[1].start === 10.5 && olcuBol[2].start === 11.9 && olcuBol[3].start === 12.35 &&
  olcuBol[0].end === 10.5 && olcuBol[2].end === 12.35 && olcuBol[3].end === 13 && olcuBol[2].text === "*herkes*" && olcuBol[3].lineEnd === true,
  JSON.stringify(olcuBol.map(function (w) { return [w.text, w.start, w.end]; })));
var eksik = [{ start: 10, end: 13, text: "Bunu gören herkes şaşırdı bugün", words: olcuSatir[0].words }];
ok("splitToWords: sayı tutmazsa karakter ağırlıklı yedek (kelimesizle aynı)",
  JSON.stringify(engine.splitToWords(eksik)) === JSON.stringify(engine.splitToWords([{ start: 10, end: 13, text: "Bunu gören herkes şaşırdı bugün" }])));
var bozuk = [{ start: 0, end: 2, text: "a b", words: [{ text: "a", start: 1.5, end: 1.6 }, { text: "b", start: 0.2, end: 0.3 }] }];
var bozukBol = engine.splitToWords(bozuk);
ok("splitToWords: ölçülmüş başlangıçlar azalmaz ve cue içinde kalır", bozukBol[0].start === 0 && bozukBol[1].start >= bozukBol[0].start && bozukBol[1].start <= 2, JSON.stringify(bozukBol));
var hzOlcu = engine.compile({ styleId: "hormozi", cues: olcuSatir, cueKind: "lines", offset: 10, width: 1280, height: 720 }).ass;
var hzKarakter = engine.compile({ styleId: "hormozi", cues: [{ start: 10, end: 13, text: olcuSatir[0].text }], cueKind: "lines", offset: 10, width: 1280, height: 720 }).ass;
ok("compile: ölçülmüş kelimeler ofsetle taşınır, aktif kelime gerçek anda (1.90 sn) değişir", hzOlcu !== hzKarakter && /0:00:01\.90/.test(hzOlcu), (hzOlcu.match(/Dialogue: [^,]*,[^,]*,[^,]*/g) || []).slice(0, 6).join(" | "));
ok("compile: kelimesiz cue'larda çıktı değişmez (anlık görüntü yukarıda bayt bayt)", engine.compile({ styleId: "hormozi", cues: satirlar, cueKind: "lines", width: 1280, height: 720 }).ass === hz);

function styleAlanlari(ass) {
  var satir = ass.split("\n").filter(function (l) { return /^Style: /.test(l); })[0] || "";
  return satir.slice(7).split(",");
}
var enjeksiyon = engine.compile({ styleId: "viral", cues: snapKelime, width: 1080, height: 1920, overrides: {
  font: "Arial,0,0}{\\pos(0,0)", renk: "#}{\\b1", konturRenk: "red", vurguRenk: "#12345g", konum: "guvenli", boyut: "9999}", kontur: {}, fontFile: "../../x.ttf", guvenli: "1"
} });
var alanlar = styleAlanlari(enjeksiyon.ass);
ok("enjekte edilen ince ayar notralize: Style satiri 23 alan", alanlar.length === 23, alanlar.length + " · " + alanlar.join(","));
ok("enjekte font stilin kendi fontuna duser", alanlar[1] === "Archivo Black" && enjeksiyon.fontFiles[0] === "ArchivoBlack.ttf", alanlar[1] + " " + enjeksiyon.fontFiles);
ok("enjekte renkler stilin renklerine duser", alanlar[3] === engine.assColor("#ffffff") && alanlar[5] === engine.assColor("#05070b") &&
  enjeksiyon.style.vurguRenk === "#ffd83d" && alanlar[2] === "118" && alanlar[16] === "8", alanlar.slice(2, 6).join(","));
ok("ASS'te enjeksiyon izi yok", !/\\b1|pos\(0,0\)|\.\.\/|guvenli/.test(enjeksiyon.ass));
ok("Alignment alani 1/2/5/8 (guvenli yazilmaz)", /^[1258]$/.test(alanlar[18]), alanlar[18]);
ok("fontFile girdiden alinmaz, paket fontundan turetilir", engine.compile({ styleId: "viral", cues: snapKelime, overrides: { font: "Lora", fontFile: "../../x.ttf" } }).fontFiles[0] === "Lora.ttf");
ok("__proto__ ince ayari yok sayilir", engine.compile({ styleId: "viral", cues: snapKelime, overrides: JSON.parse('{"__proto__":{"font":"Lora"}}') }).style.font === "Archivo Black");
ok("GUVENLI_ALAN disa aktarilir (ust %7, sag ikon sutunu %87, alt %78)", engine.GUVENLI_ALAN.length === 3 && engine.GUVENLI_ALAN[0].h === 0.07 &&
  engine.GUVENLI_ALAN[1].x === 0.87 && engine.GUVENLI_ALAN[2].y === 0.78);
var g916 = engine.compile({ styleId: "viral", cues: snapKelime, width: 1080, height: 1920, overrides: { guvenli: true } });
ok("9:16 + guvenli cikti farkli (yazi daralir)", ozet(g916) !== snap["viral@1080x1920:words:yok"]);
ok("guvenli sonrasi motor durumu sifirlanir", ozet(engine.compile({ styleId: "viral", cues: snapKelime, cueKind: "words", width: 1080, height: 1920 })) === snap["viral@1080x1920:words:yok"]);

/* ---- 3.3: Altyazı Efektleri (efekt) — giriş ve vurgu animasyonları ---- */
var efKelime = ["Bunu", "gören", "herkes", "şaşırdı", "bugün"].map(function (w, i) { return { start: i * 0.5, end: i * 0.5 + 0.44, text: w }; });
function efekt(ov, o) {
  o = o || {};
  return engine.compile({ styleId: "efekt", cues: o.cues || efKelime, cueKind: "words", width: o.w || 1920, height: o.h || 1080,
    intensity: o.intensity, overrides: ov }).ass;
}
function olaylar(ass) { return ass.split("\n").filter(function (l) { return /^Dialogue: /.test(l); }); }
function katman(ass, n) { return olaylar(ass).filter(function (l) { return l.indexOf("Dialogue: " + n + ",") === 0; }); }
var efP = engine.preset("efekt");
ok("efekt: varsayılan görünüm (Temiz) ve kelime stili", efP.name === "Altyazı Efektleri" && efP.style.giris === "fade" && efP.style.aktif === "yok" &&
  efP.style.vurgu === true && efP.style.satir === 2 && efP.style.kelime === 5 && engine.wordBased("efekt"), JSON.stringify(efP.style));
ok("efekt: animasyon kimlikleri TranscriptAI şablonunun dizin sırasında", engine.GIRISLER.join(",") === "yok,pop,fade,yukari,asagi,zipla" &&
  engine.AKTIFLER.join(",") === "yok,zipla,titre,glitch" && engine.EFEKT_ALANLARI.join(",") === "giris,aktif,vurgu,kalin,italik,satir,kelime,golge,kutu,kutuRenk,kutuOpak,konumX,konumY");
// 1920x1080, konum 2 (alt): \an2 \pos(960,907); kayma scaled(50) = 50
var girisBekle = {
  yok: function (l) { return /\{\\an2\\pos\(960,907\)\\fs\d+\\q2/.test(l) && !/\\fscx0|\\fad|\\move/.test(l); },
  pop: function (l) { return /\\fscx0\\fscy0\\t\(0,300,\\fscx100\\fscy100\)/.test(l); },
  fade: function (l) { return /\\fad\(300,0\)/.test(l); },
  yukari: function (l) { return /\{\\an2\\move\(960,957,960,907,0,300\)/.test(l); },
  asagi: function (l) { return /\{\\an2\\move\(960,857,960,907,0,300\)/.test(l); },
  zipla: function (l) { return /\\fscx0\\fscy0\\t\(0,150,\\fscx112\\fscy112\)\\t\(150,231,\\fscx96\\fscy96\)\\t\(231,300,\\fscx100\\fscy100\)/.test(l); }
};
Object.keys(girisBekle).forEach(function (g) {
  var ol = olaylar(efekt({ giris: g }));
  var ilk = ol[0], sonrakiler = ol.slice(1).filter(function (l) { return !/^Dialogue: 1,0:00:00\.00,/.test(l); });
  ok("efekt giriş " + g + ": kartın ilk olayında beklenen etiket, sonraki kelimelerde giriş yok", girisBekle[g](ilk) &&
    sonrakiler.every(function (l) { return !/\\fscx0|\\fad\(|\\move\(/.test(l); }), ilk.slice(0, 160));
});
ok("efekt giriş: geçersiz değer ve \"\" stilin kendi girişine (Belirme) düşer", /\\fad\(300,0\)/.test(olaylar(efekt({ giris: "uzay" }))[0]) &&
  /\\fad\(300,0\)/.test(olaylar(efekt({ giris: "" }))[0]) && /\\fad\(300,0\)/.test(olaylar(efekt({ giris: 3 }))[0]));
ok("efekt giriş: süre hareket şiddetine bölünür (Sert: 300/1,28 = 234 ms)", /\\fscx0\\fscy0\\t\(0,234,/.test(olaylar(efekt({ giris: "pop" }, { intensity: "hard" }))[0]));

// Vurgu animasyonu: zıpla — etkin kelime taban satırda saydam, üst katmanda 15 px yukarı ve geri (2 × 100 ms)
var zp = efekt({ giris: "yok", aktif: "zipla" });
var zk2 = katman(zp, 2);
ok("efekt vurgu zıpla: taban satırda etkin kelime saydam, üst katman yalnız o kelime",
  /^Dialogue: 1,0:00:00\.50,0:00:01\.00,.*\{\\alpha&HFF&\}\{\\1c[^}]*\}gören/.test(olaylar(zp).join("\n").split("\n").filter(function (l) { return /^Dialogue: 1,0:00:00\.50/.test(l); })[0] || "") &&
  zk2.every(function (l) { return /\}\{\\alpha&HFF&\}/.test(l); }), zk2[0]);
ok("efekt vurgu zıpla: \\move 907→892→907, 100 ms + 100 ms, sonra durağan", zk2.some(function (l) { return /^Dialogue: 2,0:00:00\.50,0:00:00\.60,.*\\move\(960,907,960,892,0,100\)/.test(l); }) &&
  zk2.some(function (l) { return /^Dialogue: 2,0:00:00\.60,0:00:00\.70,.*\\move\(960,892,960,907,0,100\)/.test(l); }) &&
  zk2.some(function (l) { return /^Dialogue: 2,0:00:00\.70,0:00:01\.00,.*\\pos\(960,907\)/.test(l); }), zk2.slice(3, 6).join(" | ").slice(0, 300));
// titre: 4 kısa ±3 px sarsıntı (toplam 150 ms), sonra durağan
var tt = katman(efekt({ giris: "yok", aktif: "titre" }), 2).filter(function (l) { return /^Dialogue: 2,0:00:00\.(5|6)/.test(l); });
ok("efekt vurgu titre: 4 sarsıntı ±3 px (≈37 ms), sonra durağan", tt.length === 5 && /\\pos\(963,904\)/.test(tt[0]) && /\\pos\(957,910\)/.test(tt[1]) &&
  /\\pos\(963,910\)/.test(tt[2]) && /\\pos\(957,904\)/.test(tt[3]) && /0:00:00\.65,0:00:01\.00,.*\\pos\(960,907\)/.test(tt[4]), tt.map(function (l) { return l.slice(10, 34); }).join(" | "));
// glitch: altta kırmızı / camgöbeği iki kopya, konturun ötesinde ±6 px, 100 ms
var gl = katman(efekt({ giris: "yok", aktif: "glitch" }), 0);
var kontur5 = 5;
ok("efekt vurgu glitch: kelime başına iki alt katman (kırmızı / camgöbeği), ±(6 + kontur) px, 100 ms",
  gl.length === 10 && /^Dialogue: 0,0:00:00\.00,0:00:00\.10,.*\\pos\(949,907\).*\\bord0\}.*\\1c&H00552AFF/.test(gl[0]) &&
  new RegExp("\\\\pos\\(" + (960 + 6 + kontur5) + ",907\\).*\\\\1c&H00FFF52A").test(gl[1]), gl.slice(0, 2).join(" | ").slice(0, 320));
ok("efekt vurgu: geçersiz değer stilin kendine (yok) düşer, üst katman olmaz", katman(efekt({ aktif: "dans" }), 2).length === 0 && katman(efekt({ aktif: "dans" }), 0).length === 0);
// Giriş + vurgu birlikte: ilk kelimenin hareketi giriş bitince başlar
var gz = katman(efekt({ giris: "pop", aktif: "zipla" }), 2);
ok("efekt giriş + zıpla: ilk kelimenin üst katmanı girişle gelir, zıplama 300 ms sonra", /^Dialogue: 2,0:00:00\.00,0:00:00\.30,.*\\fscx0\\fscy0\\t\(0,300/.test(gz[0]) &&
  /^Dialogue: 2,0:00:00\.30,0:00:00\.40,.*\\move\(960,907,960,892,0,100\)/.test(gz[1]), gz.slice(0, 2).join(" | ").slice(0, 300));

/*
 * Kısa ilk kelime (ve, bu, bir: 120 ms < T = 300 ms): giriş ikinci kelimenin olayında o anki hâlinden
 * sürer, kart başından T ms sonra (0,20 + 0,30 = 0,50 s) biter. Eskiden ikinci olay girişsizdi:
 * pop kartı %40'tan %100'e, kayan kartı 30 px tek karede sıçratıyordu.
 */
var kisaIlk = [{ start: 0.2, end: 0.32, text: "ve" }, { start: 0.32, end: 0.67, text: "bunu" }, { start: 0.67, end: 1.0, text: "gördük" }];
function kisa(ov) { return olaylar(efekt(ov, { cues: kisaIlk })); }
var kisaBekle = {
  pop: /^Dialogue: 1,0:00:00\.32,0:00:00\.67,.*\\fscx40\\fscy40\\t\(0,180,\\fscx100\\fscy100\)\}/,
  zipla: /^Dialogue: 1,0:00:00\.32,0:00:00\.67,.*\\fscx90\\fscy90\\t\(0,30,\\fscx112\\fscy112\)\\t\(30,111,\\fscx96\\fscy96\)\\t\(111,180,\\fscx100\\fscy100\)\}/,
  fade: /^Dialogue: 1,0:00:00\.32,0:00:00\.67,.*\\fade\(153,0,0,0,180,180,180\)\}/,
  yukari: /^Dialogue: 1,0:00:00\.32,0:00:00\.67,Suflo,,0,0,0,,\{\\an2\\move\(960,937,960,907,0,180\)/,
  asagi: /^Dialogue: 1,0:00:00\.32,0:00:00\.67,Suflo,,0,0,0,,\{\\an2\\move\(960,877,960,907,0,180\)/
};
Object.keys(kisaBekle).forEach(function (g) {
  var ol = kisa({ giris: g });
  ok("efekt kısa ilk kelime + giriş " + g + ": giriş ikinci kelimede kaldığı yerden sürer, kart başından 300 ms sonra biter",
    kisaBekle[g].test(ol[1]) && !/\\fscx|\\fad|\\move/.test(ol[2]), ol[1].slice(0, 200));
});
ok("efekt kısa ilk kelime: giriş T ms içinde bittiyse sonraki kelimeye taşınmaz (0,67 s)", kisa({ giris: "pop" })[2].indexOf("\\t(") === -1);
var kisaZ = katman(efekt({ giris: "pop", aktif: "zipla" }, { cues: kisaIlk }), 2);
ok("efekt kısa ilk kelime + zıpla: kelime hareketi kaybolmaz (kelime başında, girişle birlikte)",
  /^Dialogue: 2,0:00:00\.20,0:00:00\.30,.*\\move\(960,907,960,892,0,100\).*\\fscx0\\fscy0\\t\(0,300,/.test(kisaZ[0]) &&
  /^Dialogue: 2,0:00:00\.30,0:00:00\.32,.*\\move\(960,892,960,907,0,100\).*\\fscx33\\fscy33\\t\(0,200,/.test(kisaZ[1]), kisaZ.slice(0, 2).join(" | ").slice(0, 400));
var kisaG = katman(efekt({ giris: "fade", aktif: "glitch" }, { cues: kisaIlk }), 0);
ok("efekt kısa ilk kelime + glitch: ilk kelimenin kopyaları da çıkar, giriş saydamlığıyla",
  kisaG.length === 6 && /^Dialogue: 0,0:00:00\.22,0:00:00\.32,.*\\fade\(238,0,0,0,280,280,280\)/.test(kisaG[0]), kisaG.slice(0, 1).join("").slice(0, 200));
// Kayan giriş + zıplayan kelime: iki hareketin toplamı (ilk kırılımda yeni olay), konum sıçramaz
var kisaK = katman(efekt({ giris: "yukari", aktif: "zipla" }, { cues: kisaIlk }), 2);
ok("efekt kısa ilk kelime + kayma + zıpla: kelime kayan satırla birlikte zıplar",
  /^Dialogue: 2,0:00:00\.20,0:00:00\.30,Suflo,,0,0,0,,\{\\an2\\move\(960,957,960,925,0,100\)/.test(kisaK[0]) &&
  /^Dialogue: 2,0:00:00\.32,0:00:00\.42,Suflo,,0,0,0,,\{\\an2\\move\(960,937,960,905,0,100\)/.test(kisaK[2]), kisaK.slice(0, 3).join(" | ").slice(0, 400));

// Kelime vurgusu
var vk = olaylar(efekt({ giris: "yok", vurgu: false }));
ok("efekt: kelime vurgusu ve vurgu animasyonu kapalı → kart tek olay, vurgu rengi yok", vk.length === 1 && vk[0].indexOf("&H003FD2FF") === -1, vk.length + " olay");
var va = olaylar(efekt({ giris: "yok", vurgu: true, vurguRenk: "#00ff00" }));
ok("efekt: kelime vurgusu açık → her kelime kendi olayında vurgu renginde", va.length === 5 && /\{\\1c&H0000FF00\}herkes/.test(va[2]), va[2]);
var vy = olaylar(engine.compile({ styleId: "efekt", cues: [{ start: 0, end: 1, text: "bir *önemli* söz" }], cueKind: "lines", width: 1920, height: 1080, overrides: { vurgu: false, giris: "yok" } }).ass);
ok("efekt: *anahtar kelime* vurgu kapalıyken de vurgu renginde", vy.length === 1 && /\{\\1c&H003FD2FF\}önemli\{\\1c&H00FFFFFF\}/.test(vy[0]), vy[0]);

// Satır sayısı ve en çok kelime
var uzun = "Bugün size kamerayla ilgili birkaç şey anlatacağım".split(" ").map(function (w, i) { return { start: i * 0.4, end: i * 0.4 + 0.35, text: w }; });
function nSay(ass) { return olaylar(ass).map(function (l) { return (l.match(/\\N/g) || []).length; }); }
ok("efekt satır 1: hiç \\N yok", nSay(efekt({ satir: 1, kelime: 7, vurgu: false }, { cues: uzun })).every(function (n) { return n === 0; }));
ok("efekt satır 2: 3+ kelimelik kart iki satır", nSay(efekt({ satir: 2, kelime: 7, vurgu: false }, { cues: uzun })).every(function (n) { return n === 1; }));
ok("efekt satır 3: 5+ kelimelik kart üç satır", nSay(efekt({ satir: 3, kelime: 7, vurgu: false }, { cues: uzun })).every(function (n) { return n === 2; }));
var u3 = olaylar(efekt({ satir: 3, kelime: 7, vurgu: false, giris: "yok" }, { cues: uzun }))[0];
ok("efekt satır 3: en uzun satırı en kısa kırılım", /\}Bugün size\\Nkamerayla ilgili\\Nbirkaç şey anlatacağım$/.test(u3) ||
  /\}Bugün size kamerayla\\Nilgili birkaç\\Nşey anlatacağım$/.test(u3), u3.slice(-80));
ok("efekt en çok kelime: kart en çok N kelime (7 kelime, 3'er → 3 kart)", olaylar(efekt({ kelime: 3, vurgu: false, giris: "yok" }, { cues: uzun })).length === 3);
ok("efekt satır / kelime: aralık dışı ya da kesirli değer stilin kendine (2 / 5) düşer",
  efekt({ satir: 9, kelime: 0, vurgu: false }, { cues: uzun }) === efekt({ vurgu: false }, { cues: uzun }) &&
  efekt({ satir: 2.5, kelime: "3", vurgu: false }, { cues: uzun }) === efekt({ vurgu: false }, { cues: uzun }));

// Kalın / italik: yalnız Style satırında (eski stiller hep kalın, düz)
var stK = styleAlanlari(efekt({ kalin: false, italik: true }));
ok("efekt kalın kapalı + italik: Style satırı Bold 0, Italic -1", stK[7] === "0" && stK[8] === "-1", stK.slice(7, 9).join(","));
ok("efekt varsayılan: kalın, düz", styleAlanlari(efekt({}))[7] === "-1" && styleAlanlari(efekt({}))[8] === "0");
ok("eski stilde kalın / italik alanı çıktıyı değiştirmez", engine.compile({ styleId: "viral", cues: snapKelime, overrides: { kalin: false, italik: true } }).ass ===
  engine.compile({ styleId: "viral", cues: snapKelime }).ass);
// "Kalın yazı" kapalı: Montserrat'ın statik Regular yüzü (yalnız Bold dosyası varken libass kalını inceltemiyordu)
ok("efekt kalın kapalı + Montserrat: katmana Montserrat-Regular.ttf gider, açıkken Bold",
  engine.compile({ styleId: "efekt", cues: efKelime, overrides: { kalin: false } }).fontFiles.join() === "Montserrat-Regular.ttf" &&
  engine.compile({ styleId: "efekt", cues: efKelime, overrides: { kalin: true } }).fontFiles.join() === "Montserrat-Bold.ttf" &&
  fs.existsSync(path.join(root, "fonts", "Montserrat-Regular.ttf")));
ok("efekt kalın kapalı + tek ağırlıklı font (Anton): aynı dosya, Style satırı Bold 0 (libass sahte kalını bırakır)",
  engine.compile({ styleId: "efekt", cues: efKelime, overrides: { font: "Anton", kalin: false } }).fontFiles.join() === "Anton.ttf");
ok("eski stilde kalın alanı yazı tipi dosyasını değiştirmez (Clean Pill hep Montserrat-Bold)",
  engine.compile({ styleId: "capcut", cues: snapKelime, overrides: { kalin: false } }).fontFiles.join() === "Montserrat-Bold.ttf");
ok("efekt: dize / sayı boolean alanları reddedilir", styleAlanlari(efekt({ kalin: "false", italik: 1 }))[7] === "-1" && styleAlanlari(efekt({ italik: "true" }))[8] === "0");
ok("efekt: kontur 0 → \\bord0 (en az 1 px'e yuvarlanmaz)", /\\bord0\\shad0/.test(olaylar(efekt({ kontur: 0 }))[0]));
ok("efekt 9:16 + alt konum: alt arayüzün üstüne (%74) çekilir; orta %62", /\{\\an2\\pos\(540,1421\)/.test(olaylar(efekt({ giris: "yok" }, { w: 1080, h: 1920 }))[0]) &&
  /\{\\an5\\pos\(540,1190\)/.test(olaylar(efekt({ konum: 5, giris: "yok" }, { w: 1080, h: 1920 }))[0]));
var konusmaci = engine.compile({ styleId: "efekt", cues: efKelime.map(function (c) { return Object.assign({ speaker: 0 }, c); }), cueKind: "words", width: 1920, height: 1080,
  speakerColors: ["#ff0000"], overrides: { aktif: "zipla" } }).ass;
ok("efekt + Podcast Modu: konuşmacı rengi satıra işler", /\{\\1c&H000000FF\}\{\\an2/.test(konusmaci));

/* ---- 3.3 adım 17: gölge, arka plan kutusu, serbest X / Y konum (yalnız Altyazı Efektleri) ---- */
function katmanlar(ass) { return olaylar(ass).map(function (l) { return Number(l.split(",")[0].replace("Dialogue: ", "")); }); }
ok("efekt adım 17 varsayılanı: gölge yok, kutu kapalı, hazır konum; çıktı aynı (boş / kapalı değerler bayt bayt aynı)",
  efP.style.golge === null && efP.style.kutu === false && efP.style.konumX === null && efP.style.konumY === null &&
  efekt({ golge: null, kutu: false, kutuRenk: "#ff0000", kutuOpak: 90, konumX: null, konumY: null }) === efekt({}) &&
  efekt({ golge: false }) === efekt({}) && efekt({ golge: "evet", kutu: "true", konumX: "50", konumY: 40 }) === efekt({}) &&
  efekt({}).indexOf("SufloKutu") === -1);
var gol = efekt({ giris: "yok", golge: { renk: "#ff0000", opak: 50, mesafe: 10, yumusak: 6 } });
var golOl = olaylar(gol);
var golgeSatir = golOl.filter(function (l) { return /^Dialogue: 1,/.test(l); }), metinSatir = golOl.filter(function (l) { return /^Dialogue: 3,/.test(l); });
ok("efekt gölge: her metin olayının gölge katmanında (1) aynı zamanlı ikizi; metin 3. katmanda",
  golgeSatir.length === 5 && metinSatir.length === 5 && golgeSatir.every(function (l, i) { return l.split(",").slice(1, 3).join() === metinSatir[i].split(",").slice(1, 3).join(); }),
  golOl.length + " olay");
ok("efekt gölge: \\4c + \\4a (opak %50 → 80) + \\shad mesafe·cos45 (7.1) + \\blur yumuşaklık/2 (3); kontur saydam, dolgu 1/255 (dolu gölge)",
  golgeSatir.every(function (l) { return /\\1a&HFE&\\3a&HFF&\\4c&H000000FF\\4a&H80&\\shad7\.1\\blur3/.test(l); }), golgeSatir[0]);
ok("efekt gölge etiketleri yalnız gölge katmanında: metin keskin (\\blur yok, \\shad0)",
  metinSatir.every(function (l) { return /\\shad0/.test(l) && !/\\blur|\\4a|\\4c/.test(l); }) &&
  golOl.every(function (l) { return !/\\blur/.test(l) || /^Dialogue: 1,/.test(l); }));
var golK0 = olaylar(efekt({ giris: "yok", kontur: 0, golge: { opak: 100, mesafe: 0, yumusak: 0 } }));
ok("efekt gölge, kontur 0 ve mesafe 0: gölge kopyası yine çizilir (dolgu 1/255, ofset 0,01: libass ofset 0'da gölgeyi atlar)",
  golK0.filter(function (l) { return /^Dialogue: 1,/.test(l); }).every(function (l) { return /\\bord0\\shad0\\1a&HFE&\\3a&HFF&\\4c&H00000000\\4a&H00&\\shad0\.01\}/.test(l); }), golK0[0]);
var golZ = olaylar(efekt({ giris: "yok", aktif: "zipla", golge: { renk: "#000000", opak: 75, mesafe: 5, yumusak: 5 } }));
var golZust = golZ.filter(function (l) { return /^Dialogue: 4,/.test(l); }), golZgol = golZ.filter(function (l) { return /^Dialogue: 1,/.test(l); });
ok("efekt gölge + zıpla: hareketli kelimenin gölgesi onunla zıplar; gölge kopyasında görünür işaret yalnız gölgeyi açar",
  golZust.length > 0 && golZgol.length === golZ.filter(function (l) { return /^Dialogue: [34],/.test(l); }).length &&
  golZgol.every(function (l) { return l.indexOf("\\alpha&H00&") === -1; }) && golZgol.some(function (l) { return /\\move\(960,907,960,892/.test(l) && /\{\\1a&HFE&\\3a&HFF&\\4a&H40&\}/.test(l); }), golZgol.slice(0, 3).join(" | "));
/*
 * Gölge kopyasında görünür her metin koşusu dolgu 1/255 (\1a FE) ile çizilmeli: \alpha&HFF& (zıpla / titrede
 * etkin kelimenin çevresi) \1a'yı da FF yapar; yalnız \4a açılırsa libass gölgeyi içi boş halka çizer, kontur 0'da
 * hiç çizmez. Her koşunun etkin \1a / \4a değeri etiket sırasıyla izlenir.
 */
function golgeKosulari(l) {
  var m = /^Dialogue: [^,]*(?:,[^,]*){8},(.*)$/.exec(l), t = m ? m[1] : "", a1 = "00", a4 = "00", out = [], re = /\{([^}]*)\}|([^{]+)/g, x;
  while ((x = re.exec(t))) {
    if (x[1] !== undefined) {
      var r2 = /\\(alpha|1a|4a)&H([0-9A-F]{2})&/g, y;
      while ((y = r2.exec(x[1]))) { if (y[1] === "alpha") { a1 = y[2]; a4 = y[2]; } else if (y[1] === "1a") a1 = y[2]; else a4 = y[2]; }
    } else if (x[2].replace(/\\N/g, "").trim()) out.push({ metin: x[2], a1: a1, a4: a4 });
  }
  return out;
}
["zipla", "titre"].forEach(function (akt) {
  [4, 0].forEach(function (kon) {
    var ol = olaylar(efekt({ giris: "yok", aktif: akt, kontur: kon, golge: { renk: "#ff0000", opak: 75, mesafe: 5, yumusak: 0 } }));
    var kos = [];
    ol.filter(function (l) { return /^Dialogue: 1,/.test(l); }).forEach(function (l) { kos = kos.concat(golgeKosulari(l)); });
    var gorunur = kos.filter(function (k) { return k.a4 !== "FF"; });
    ok("efekt gölge + " + akt + ", kontur " + kon + ": gölge kopyasında görünür her koşu dolu (\\1a FE; \\alpha&HFF& sonrası FF kalmaz)",
      gorunur.length > 5 && gorunur.every(function (k) { return k.a1 === "FE" && k.a4 === "40"; }) &&
      kos.every(function (k) { return k.a4 === "FF" || k.a4 === "40"; }),
      gorunur.filter(function (k) { return k.a1 !== "FE"; }).map(function (k) { return k.metin + ":" + k.a1; }).slice(0, 4).join(" ") || gorunur.length + " koşu");
  });
});
var golG = olaylar(efekt({ giris: "yok", aktif: "glitch", golge: { opak: 75 } }));
ok("efekt gölge + glitch: glitch kopyaları (2) gölgesiz, metnin altında", golG.filter(function (l) { return /^Dialogue: 2,/.test(l); }).length === 10 &&
  golG.filter(function (l) { return /^Dialogue: 1,/.test(l); }).length === golG.filter(function (l) { return /^Dialogue: 3,/.test(l); }).length);
ok("efekt gölge: aralık dışı değerler kırpılır, bozuk alan şablon varsayılanına döner (siyah, 5, 5)",
  /\\4c&H00000000\\4a&H00&\\shad0\.01\\blur2\.5/.test(olaylar(efekt({ giris: "yok", golge: { renk: "kırmızı", opak: 500, mesafe: -3, yumusak: "x" } }))[0]) &&
  /\\shad14\.1\\blur15/.test(olaylar(efekt({ giris: "yok", golge: { mesafe: 99, yumusak: 99 } }))[0]));
ok("efekt gölge 9:16 / 4K: mesafe ve yumuşaklık kısa kenara göre ölçeklenir (2160p'de 2 kat)",
  /\\shad14\.1\\blur10/.test(olaylar(efekt({ giris: "yok", golge: { mesafe: 10, yumusak: 10 } }, { w: 3840, h: 2160 }))[0]) &&
  /\\shad7\.1\\blur5/.test(olaylar(efekt({ giris: "yok", golge: { mesafe: 10, yumusak: 10 } }, { w: 1080, h: 1920 }))[0]));

var kut = efekt({ giris: "yok", kutu: true, kutuRenk: "#112233", kutuOpak: 60 });
var kutStil = kut.split("\n").filter(function (l) { return /^Style: SufloKutu,/.test(l); });
var kutOl = olaylar(kut).filter(function (l) { return /,SufloKutu,/.test(l); });
ok("efekt kutu: ikinci stil satırı SufloKutu (BorderStyle 3, aynı yazı tipi / punto / kalın / italik)", kutStil.length === 1 &&
  styleAlanlari(kut).slice(1, 10).join() === kutStil[0].split(",").slice(1, 10).join() && kutStil[0].split(",")[15] === "3", kutStil[0]);
ok("efekt kutu: kart başına bir kutu olayı (katman 0), kartın tamamı boyunca; renk \\3c, opaklık %60 → 66, yatay pay 20, dikey pay 0",
  kutOl.length === 1 && /^Dialogue: 0,0:00:00\.00,0:00:02\.44,SufloKutu,/.test(kutOl[0]) &&
  /\{\\an2\\pos\(960,907\)\\fs\d+\\q2\\1a&HFF&\\3c&H00332211\\3a&H66&\\xbord20\\ybord0\\shad0\}Bunu gören herkes\\Nşaşırdı bugün$/.test(kutOl[0]), kutOl[0]);
ok("efekt kutu: metin katmanları üstte (3), kutu metnin satır kırılımıyla aynı", katmanlar(kut).filter(function (n) { return n === 3; }).length === 5 &&
  olaylar(kut).filter(function (l) { return /^Dialogue: 3,/.test(l); }).every(function (l) { return /\\N/.test(l); }));
var kutKay = olaylar(efekt({ giris: "yukari", kutu: true })).filter(function (l) { return /SufloKutu/.test(l); })[0];
var kutPop = olaylar(efekt({ giris: "pop", kutu: true })).filter(function (l) { return /SufloKutu/.test(l); })[0];
ok("efekt kutu + giriş: kayan girişte kartla kayar, ölçek / saydamlık girişi almaz (şablondaki gibi)",
  /\{\\an2\\move\(960,957,960,907,0,300\)/.test(kutKay) && /\{\\an2\\pos\(960,907\)/.test(kutPop) && !/\\fscx|\\fad/.test(kutPop + kutKay), kutKay);
ok("efekt kutu: opaklık kırpılır (150 → 100 = 00), varsayılan renk / opaklık siyah %50",
  /\\3a&H00&/.test(efekt({ kutu: true, kutuOpak: 150 })) && /\\3c&H00000000\\3a&H80&/.test(efekt({ kutu: true })));
ok("efekt kutu + gölge: kutu 0, gölge 1, metin 3", (function () {
  var k = katmanlar(efekt({ giris: "yok", kutu: true, golge: { opak: 50 } }));
  return k[0] === 0 && k.filter(function (n) { return n === 1; }).length === 5 && k.filter(function (n) { return n === 3; }).length === 5;
})());

var xy = olaylar(efekt({ giris: "yok", konumX: 30, konumY: 40 }));
ok("efekt serbest konum: \\an5, kartın ortası X·genişlik, Y·yükseklik (1920×1080'de %30 / %40 → 576, 432)", /^Dialogue: 1,.*\{\\an5\\pos\(576,432\)/.test(xy[0]), xy[0]);
ok("efekt serbest konum hazır konumun (konum 8) önüne geçer; ikisinden biri yoksa hazır konum",
  /\{\\an5\\pos\(576,432\)/.test(olaylar(efekt({ giris: "yok", konum: 8, konumX: 30, konumY: 40 }))[0]) &&
  /\{\\an8\\pos\(960,238\)/.test(olaylar(efekt({ giris: "yok", konum: 8, konumX: 30 }))[0]));
ok("efekt serbest konum: %5-95'e kırpılır (0 → 5, 120 → 95), kesirli değer yuvarlanır",
  efekt({ giris: "yok", konumX: 0, konumY: 120 }) === efekt({ giris: "yok", konumX: 5, konumY: 95 }) &&
  efekt({ giris: "yok", konumX: 30.4, konumY: 39.6 }) === efekt({ giris: "yok", konumX: 30, konumY: 40 }));
var kenar = olaylar(efekt({ giris: "yok", konumX: 5, konumY: 95, kelime: 5, satir: 1, vurgu: false }));
var kx = Number(/\\pos\((\d+),(\d+)\)/.exec(kenar[0])[1]), ky = Number(/\\pos\((\d+),(\d+)\)/.exec(kenar[0])[2]);
ok("efekt serbest konum kenarda: uzun kart kadraja sığdırılır (sol kenar ve alt kenar içeride)", kx > 96 && kx - 380 > 0 && ky < 1027, kx + "," + ky);
var dik = olaylar(efekt({ giris: "yok", konumX: 50, konumY: 95 }, { w: 1080, h: 1920 }));
var dikY = Number(/\\pos\(\d+,(\d+)\)/.exec(dik[0])[1]);
ok("efekt serbest konum 9:16: kart alt arayüzün (%78) üstünde kalır", dikY < 1920 * 0.78 && dikY > 1920 * 0.6, dikY);
var dikUst = Number(/\\pos\(\d+,(\d+)\)/.exec(olaylar(efekt({ giris: "yok", konumX: 50, konumY: 5 }, { w: 1080, h: 1920 }))[0])[1]);
ok("efekt serbest konum 9:16: kart üst çubuğun (%7) altında kalır", dikUst > 1920 * 0.07, dikUst);
var sag = olaylar(efekt({ giris: "yok", konumX: 95, konumY: 50, guvenli: true }, { w: 1080, h: 1920 }));
var sagX = Number(/\\pos\((\d+),/.exec(sag[0])[1]);
var sagSerbest = Number(/\\pos\((\d+),/.exec(olaylar(efekt({ giris: "yok", konumX: 95, konumY: 50 }, { w: 1080, h: 1920 }))[0])[1]);
ok("efekt serbest konum 9:16 + 'Platform arayüzünden kaçın': kart sağdaki ikon sütunundan (%87) uzak, kapalıyken kadraj kenarına dek",
  sagX < sagSerbest && sagX < 1080 * 0.87, sagX + " / " + sagSerbest);
ok("efekt serbest konum + zıpla: hareketli kelime kartın noktasından zıplar", olaylar(efekt({ giris: "yok", aktif: "zipla", konumX: 30, konumY: 40 }))
  .some(function (l) { return /^Dialogue: 2,.*\\move\(576,432,576,417,0,100\)/.test(l); }));
ok("efekt serbest konum + glitch: kopyalar kartın noktasının iki yanında", olaylar(efekt({ giris: "yok", aktif: "glitch", konumX: 30, konumY: 40 }))
  .some(function (l) { return /^Dialogue: 0,.*\\pos\(565,432\)/.test(l); }));
ok("efekt serbest konum + kutu: kutu kartla aynı noktada", /SufloKutu,,0,0,0,,\{\\an5\\pos\(576,432\)/.test(efekt({ giris: "yok", kutu: true, konumX: 30, konumY: 40 })));

var ffmpeg = cp.spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
if (!ffmpeg) {
  console.log("(ffmpeg yok - gercek stil renderlari atlandi)");
} else {
  var tmp = path.join(os.tmpdir(), "suflo-style-engine-test");
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(tmp, { recursive: true });

  Object.keys(compiled).forEach(function (id) {
    var font = engine.preset(id).style.fontFile;
    fs.copyFileSync(path.join(root, "fonts", font), path.join(tmp, font));
    fs.writeFileSync(path.join(tmp, id + ".ass"), compiled[id].ass, "utf8");
    var png = path.join(tmp, id + ".png");
    var r = cp.spawnSync("ffmpeg", ["-y", "-loglevel", "verbose", "-f", "lavfi", "-i",
      "color=c=#111722:s=1280x720:r=25:d=2", "-vf", "ass=" + id + ".ass:fontsdir=.",
      "-ss", "0.7", "-frames:v", "1", png], { cwd: tmp, encoding: "utf8" });
    ok(id + " gercek libass render", r.status === 0 && fs.existsSync(png) && fs.statSync(png).size > 2000,
      r.status + " / " + (fs.existsSync(png) ? fs.statSync(png).size : 0) + " B");
    // libass'in GERCEKTE sectigi font: "fontselect: (Aile, 700, 0) -> secilen". Yalniz dosyanin
    // yuklendigini gormek yetmez — degisken Montserrat yuklenip DejaVu'ya dusuyordu.
    var secimler = String(r.stderr).split(/\r?\n/).filter(function (l) { return /fontselect:/.test(l); });
    var aile = engine.preset(id).style.font.toLowerCase().replace(/\s+/g, "");
    var dogru = secimler.length > 0 && secimler.every(function (l) {
      var hedef = l.split("->")[1] || "";
      return hedef.toLowerCase().replace(/\s+/g, "").indexOf(aile) !== -1;
    });
    ok(id + " kendi fontunu kullaniyor (yedege dusmuyor)", dogru, secimler.join(" | ").slice(0, 180));
  });
  /*
   * "Kalın yazı" gerçek çizimde: katmanın font klasörüne giden dosyayla Montserrat kalın açık / kapalı
   * farklı çizilir ve libass kapalıyken Regular yüzü seçer (eskiden iki kare bayt bayt aynıydı).
   */
  var kalinKare = {};
  [true, false].forEach(function (kalin) {
    var r = engine.compile({ styleId: "efekt", cues: [{ start: 0, end: 1, text: "Merhaba dünya" }], cueKind: "words", width: 640, height: 360,
      overrides: { kalin: kalin, giris: "yok" } });
    var kd = path.join(tmp, "kalin-" + kalin);
    fs.mkdirSync(kd, { recursive: true });
    r.fontFiles.forEach(function (f) { fs.copyFileSync(path.join(root, "fonts", f), path.join(kd, f)); });
    fs.writeFileSync(path.join(kd, "a.ass"), r.ass, "utf8");
    var p = cp.spawnSync("ffmpeg", ["-v", "verbose", "-f", "lavfi", "-i", "color=c=black:s=640x360:d=1", "-vf", "ass=a.ass:fontsdir=.",
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { cwd: kd, maxBuffer: 16 * 1024 * 1024 });
    kalinKare[kalin] = { kare: p.stdout || Buffer.alloc(0), secim: String(p.stderr).split(/\r?\n/).filter(function (l) { return /fontselect:/.test(l); }).join(" | ") };
  });
  ok("efekt Montserrat kalın kapalı: libass Regular yüzü seçer, kare kalın açıkkinden farklı",
    kalinKare[false].kare.length > 0 && !kalinKare[false].kare.equals(kalinKare[true].kare) && /-> Montserrat-Regular/.test(kalinKare[false].secim) &&
    /-> Montserrat-Bold/.test(kalinKare[true].secim), kalinKare[false].secim.slice(0, 160));
  /*
   * Kısa ilk kelimede giriş gerçek çizimde de sürekli: pop kartının genişliği 0,31 → 0,32 s (ikinci
   * kelimenin olayı başlar) arasında sıçramaz (eskiden %36'dan %100'e tek karede).
   */
  var popAss = engine.compile({ styleId: "efekt", cues: kisaIlk, cueKind: "words", width: 640, height: 360, overrides: { giris: "pop" } });
  var pd = path.join(tmp, "pop-kisa");
  fs.mkdirSync(pd, { recursive: true });
  fs.copyFileSync(path.join(root, "fonts", "Montserrat-Bold.ttf"), path.join(pd, "Montserrat-Bold.ttf"));
  fs.writeFileSync(path.join(pd, "a.ass"), popAss.ass, "utf8");
  var pp = cp.spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=640x360:r=100:d=0.6", "-vf", "ass=a.ass:fontsdir=.",
    "-f", "rawvideo", "-pix_fmt", "gray", "-"], { cwd: pd, maxBuffer: 64 * 1024 * 1024 });
  function genislik(n) {
    var b = pp.stdout || Buffer.alloc(0), fr = 640 * 360, enSol = 640, enSag = -1;
    if (b.length < (n + 1) * fr) return -1;
    for (var y = 0; y < 360; y++) for (var x = 0; x < 640; x++) if (b[n * fr + y * 640 + x] > 60) { if (x < enSol) enSol = x; if (x > enSag) enSag = x; }
    return enSag - enSol + 1;
  }
  var g31 = genislik(31), g32 = genislik(32), g50 = genislik(50), g55 = genislik(55);
  ok("efekt pop + 120 ms ilk kelime: kart ikinci kelimede sıçramaz, tam boya kart başından 300 ms sonra varır",
    g31 > 0 && g32 - g31 <= g31 * 0.2 && g50 === g55 && g32 < g55 * 0.6, [g31, g32, g50, g55].join(" / "));
  /*
   * "Platform arayuzunden kacin": 9:16'da uzun kelimelerle her stilin sag kenari ikon
   * sutununun (%87) solunda kalir. Olcum gercek libass cizimi: saydam zemin, en sagdaki
   * gorunur piksel. Hiz icin 540x960'ta (PlayRes 1080x1920, oransal).
   */
  var uzunlar = [{ start: 0, end: 0.9, text: "MUHTEŞEMLİKLERİNİZDEN" }, { start: 0.9, end: 1.8, text: "KAÇIRMAMALISINIZ" },
    { start: 1.8, end: 2.7, text: "İNANILMAZDI" }, { start: 2.7, end: 3.6, text: "ARKADAŞLAR" }];
  var EW = 540, EH = 960;
  styles.forEach(function (s) {
    var r = engine.compile({ styleId: s.id, cues: uzunlar, cueKind: "words", width: 1080, height: 1920, overrides: { guvenli: true } });
    fs.writeFileSync(path.join(tmp, "guvenli.ass"), r.ass, "utf8");
    fs.copyFileSync(path.join(root, "fonts", r.fontFiles[0]), path.join(tmp, r.fontFiles[0]));
    var p = cp.spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i",
      "color=c=black@0:s=" + EW + "x" + EH + ":r=25:d=3.6,format=rgba,subtitles=f=guvenli.ass:alpha=1:fontsdir=.,select='eq(n\\,11)+eq(n\\,33)+eq(n\\,56)+eq(n\\,78)'",
      "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { cwd: tmp, maxBuffer: 64 * 1024 * 1024 });
    var b = p.stdout || Buffer.alloc(0), kare = EW * EH * 4, enSag = -1;
    for (var f = 0; f + kare <= b.length; f += kare) {
      for (var y = 0; y < EH; y++) for (var x = EW - 1; x > enSag; x--) { if (b[f + (y * EW + x) * 4 + 3] > 16) { enSag = x; break; } }
    }
    ok(s.id + " 9:16 + guvenli: sag kenar <= %87 (ikon sutunu)", p.status === 0 && b.length >= kare * 4 && enSag > 0 && (enSag + 1) / EW <= 0.87,
      p.status + " · " + (b.length / kare) + " kare · sag kenar %" + ((enSag + 1) / EW * 100).toFixed(1));
  });

  /*
   * 3.3 adım 17 gerçek çizimde. Gölge: metnin dolgusu keskin kalır (beyaz piksel sayısı gölgesizle aynı),
   * gölge yalnız gölge katmanında görünür. Kutu: iki satırın kutuları üst üste binmez (yarı saydam kutunun
   * rengi satır arasında koyulaşmaz; en çok 2 piksellik kenar yumuşatma çizgisi). 9:16 + güvenli + konumX 95:
   * sağ kenar ikon sütununun (%87) solunda.
   */
  function rgbKare(ass, fontlar, w, h, ss) {
    var kd = fs.mkdtempSync(path.join(tmp, "k17-"));
    fontlar.forEach(function (f) { fs.copyFileSync(path.join(root, "fonts", f), path.join(kd, f)); });
    fs.writeFileSync(path.join(kd, "a.ass"), ass, "utf8");
    var p = cp.spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=#405060:s=" + w + "x" + h + ":d=3", "-vf", "ass=a.ass:fontsdir=.",
      "-ss", String(ss || 1.2), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { cwd: kd, maxBuffer: 64 * 1024 * 1024 });
    return p.stdout || Buffer.alloc(0);
  }
  function say(b, f) { var n = 0; for (var i = 0; i + 2 < b.length; i += 3) if (f(b[i], b[i + 1], b[i + 2])) n++; return n; }
  var k17cues = [{ start: 0, end: 2.5, text: "Gölge keskin mi" }];
  function k17(ov, w, h) { return engine.compile({ styleId: "efekt", cues: k17cues, cueKind: "lines", width: w || 640, height: h || 360, overrides: Object.assign({ giris: "yok", vurgu: false }, ov) }); }
  var duz = k17({}), golgeli = k17({ golge: { renk: "#ff0000", opak: 100, mesafe: 12, yumusak: 20 } });
  var bDuz = rgbKare(duz.ass, duz.fontFiles, 640, 360), bGol = rgbKare(golgeli.ass, golgeli.fontFiles, 640, 360);
  function beyaz(r, g, b) { return r > 235 && g > 235 && b > 235; }
  function kirmizi(r, g, b) { return r > 110 && r - g > 50 && r - b > 50; }
  ok("efekt gölge gerçek çizim: metnin dolgusu keskin (beyaz piksel sayısı gölgesizle aynı), kırmızı gölge görünür",
    bDuz.length > 0 && Math.abs(say(bGol, beyaz) - say(bDuz, beyaz)) <= say(bDuz, beyaz) * 0.03 && say(bGol, kirmizi) > 400 && say(bDuz, kirmizi) === 0,
    say(bDuz, beyaz) + " / " + say(bGol, beyaz) + " beyaz · " + say(bGol, kirmizi) + " kırmızı");
  var gK0 = k17({ kontur: 0, golge: { renk: "#ff0000", opak: 100, mesafe: 20, yumusak: 0 } });
  var bK0 = rgbKare(gK0.ass, gK0.fontFiles, 640, 360);
  ok("efekt gölge gerçek çizim, kontur 0: gölge yine çizilir", say(bK0, kirmizi) > 300, say(bK0, kirmizi) + " kırmızı");
  // konturlu metinde gölge içi dolu (\1a FF'de yalnız kontur halkasıydı: kırmızı alan dolgunun yarısı kadar kalıyordu)
  var gK8 = k17({ kontur: 4, boyut: 150, golge: { renk: "#ff0000", opak: 100, mesafe: 20, yumusak: 0 } }), gD8 = k17({ kontur: 4, boyut: 150 });
  var bK8 = rgbKare(gK8.ass, gK8.fontFiles, 640, 360), dolgu8 = say(rgbKare(gD8.ass, gD8.fontFiles, 640, 360), beyaz);
  ok("efekt gölge gerçek çizim, konturlu: gölge dolu glif (içi boş halka değil)", dolgu8 > 500 && say(bK8, kirmizi) > dolgu8 * 0.8,
    say(bK8, kirmizi) + " kırmızı / " + dolgu8 + " dolgu");
  /*
   * Zıpla + gölge, kontur 0: etkin kelime (zıplayan) ve sonrakilerin gölgesi de çizilir. Eskiden gölge kopyasında
   * \alpha&HFF& sonrası \1a FF kalıyordu: 0,3 s'de (BUNU etkin) hiçbir kelimenin gölgesi yoktu. Aynı ayarın
   * zıplasız (aktif yok) çiziminin kırmızı alanına yakın olmalı.
   */
  var zCues = [{ start: 0, end: 0.6, text: "BUNU" }, { start: 0.6, end: 1.2, text: "GOREN" }, { start: 1.2, end: 1.8, text: "HERKES" }];
  function zGolge(akt) {
    return engine.compile({ styleId: "efekt", cues: zCues, cueKind: "words", width: 640, height: 360,
      overrides: { giris: "yok", aktif: akt, kontur: 0, satir: 1, kelime: 3, golge: { renk: "#ff0000", opak: 100, mesafe: 20, yumusak: 0 } } });
  }
  var zZ = zGolge("zipla"), zY = zGolge("yok");
  var kZ = say(rgbKare(zZ.ass, zZ.fontFiles, 640, 360, 0.3), kirmizi), kY = say(rgbKare(zY.ass, zY.fontFiles, 640, 360, 0.3), kirmizi);
  ok("efekt gölge + zıpla gerçek çizim, kontur 0: etkin kelime ve sonrakilerin gölgesi dolu (zıplasızla aynı alan)",
    kY > 300 && kZ > kY * 0.85, kZ + " / " + kY + " kırmızı");
  /*
   * Önizlemede sürükleme (adım 17 inceleme): efektKonumlari'nın hazır konum noktası, çizilen kartın ORTASI (gerçek
   * libass çizimi, beyaz piksellerin dikey orta noktası) ile ±%1,5 içinde (yapışma toleransı ±%3); 16:9 ve 9:16'da.
   * Eskiden önizleme bağlantı noktasını (Alt %84 = kartın altı) kullanıyordu: 9:16'da Alt %69'da çizilirken %84'e yapışıyordu.
   */
  var ortaCues = ["Bunu", "gören", "herkes", "şaşırdı", "bugün"].map(function (w, i) { return { start: i * 0.5, end: i * 0.5 + 0.44, text: w }; });
  [[640, 360], [360, 640]].forEach(function (b) {
    [2, 5, 8].forEach(function (k) {
      var ov = { giris: "yok", vurgu: false, konum: k };
      var r = engine.compile({ styleId: "efekt", cues: ortaCues, cueKind: "words", width: b[0], height: b[1], overrides: ov });
      var px = rgbKare(r.ass, r.fontFiles, b[0], b[1], 1.2), ust = -1, alt = -1;
      for (var yk = 0; yk < b[1]; yk++) {
        for (var xk = 0; xk < b[0]; xk++) { var q = (yk * b[0] + xk) * 3; if (px[q] > 235 && px[q + 1] > 235 && px[q + 2] > 235) { if (ust < 0) ust = yk; alt = yk; break; } }
      }
      var ciz = (ust + alt) / 2 / b[1] * 100, nokta = engine.efektKonumlari(ov, b[0], b[1]).noktalar[k].y;
      ok("efektKonumlari gerçek çizim " + b[0] + "×" + b[1] + " konum " + k + ": hazır konum noktası kartın çizilen ortası (±%1,5)",
        ust >= 0 && Math.abs(ciz - nokta) <= 1.5, "çizilen %" + ciz.toFixed(1) + " · nokta %" + nokta);
    });
  });
  var kutu2 = engine.compile({ styleId: "efekt", cues: [{ start: 0, end: 2.5, text: "Kutunun ilk satırı ve ikinci satırı" }], cueKind: "lines", width: 640, height: 360,
    overrides: { giris: "yok", vurgu: false, kontur: 0, satir: 2, kelime: 6, kutu: true, kutuRenk: "#00c000", kutuOpak: 60, konumX: 50, konumY: 50 } });
  var bK = rgbKare(kutu2.ass, kutu2.fontFiles, 640, 360);
  // kutunun sol payında (metin yok) bir sütun: yeşil kanalı satırlar boyunca sabit kalmalı
  var sutun = [];
  for (var yy = 0; yy < 360; yy++) { var i0 = (yy * 640) * 3; var enSolX = -1; for (var xx = 0; xx < 640; xx++) { var j = i0 + xx * 3; if (bK[j + 1] - bK[j] > 40) { enSolX = xx; break; } } sutun.push(enSolX); }
  var satirlar = sutun.map(function (x, yy) { return x >= 0 ? yy : -1; }).filter(function (yy) { return yy >= 0; });
  // iki kutunun da içinde kalan sütun; metin pikselleri (kırmızı kanalı yüksek) sayılmaz
  var solX = Math.max.apply(null, sutun) + 2;
  var yesiller = satirlar.map(function (yy) { var q = (yy * 640 + solX) * 3; return bK[q] < 60 ? bK[q + 1] : 0; }).filter(function (g) { return g > 0; });
  var tipik = yesiller.slice().sort(function (a, b) { return a - b; })[Math.floor(yesiller.length / 2)];
  var aykiri = yesiller.filter(function (g) { return Math.abs(g - tipik) > 12; }).length;
  ok("efekt kutu gerçek çizim: iki satır kutusu üst üste binmez (yarı saydam renk satır arasında koyulaşmaz)",
    bK.length > 0 && satirlar.length > 30 && aykiri <= 3, satirlar.length + " satır · tipik G " + tipik + " · aykırı " + aykiri);
  var sagK = engine.compile({ styleId: "efekt", cues: uzunlar, cueKind: "words", width: 1080, height: 1920,
    overrides: { giris: "yok", vurgu: false, konumX: 95, konumY: 50, guvenli: true, satir: 1, kelime: 1 } });
  var bS = rgbKare(sagK.ass, sagK.fontFiles, 1080, 1920, 0.4), enSagX = -1;
  for (var y2 = 0; y2 < 1920; y2++) for (var x2 = 1079; x2 > enSagX; x2--) { var q = (y2 * 1080 + x2) * 3; if (bS[q] > 200 && bS[q + 1] > 200 && bS[q + 2] > 200) { enSagX = x2; break; } }
  ok("efekt serbest konum 9:16 + güvenli + X %95 gerçek çizim: sağ kenar <= %87", enSagX > 0 && (enSagX + 1) / 1080 <= 0.87, "sağ kenar %" + ((enSagX + 1) / 1080 * 100).toFixed(1));

  if (process.env.SUFLO_KEEP_STYLE_TEST) console.log("PREVIEW_DIR=" + tmp);
  else try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e2) {}
}

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
