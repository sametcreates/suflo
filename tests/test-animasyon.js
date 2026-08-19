var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * Animasyon motoru GERÇEKTEN animasyon üretiyor mu?
 *
 * İki katman:
 *  1) Yapısal: her animasyon için üretilen ASS'te doğru etiketler var mı,
 *     olaylar örtüşüyor mu (örtüşme = libass çakışma kaydırması = satır zıplar).
 *  2) Görsel: libass ile İKİ FARKLI ANDA kare al; animasyonlu stilde kareler
 *     FARKLI olmalı (yazı hareket ediyor), animasyonsuzda AYNI olmalı.
 *     "Etiket var" demek "çiziliyor" demek değildir — bunu yalnız render kanıtlar.
 *
 * Fontlar: paket fontların libass'te fontsdir'den yüklendiği de burada sınanır.
 */
var fs = require("fs");
var os = require("os");
var pathm = require("path");
var cp = require("child_process");

var FF = process.argv[2] || "ffmpeg";
var TMP = pathm.join(os.tmpdir(), "suflo-anim-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

var src = fs.readFileSync(KOKYOL + "js/captions.js", "utf8");
function kes(imza) {
  var i = src.indexOf(imza);
  if (i === -1) throw new Error("bulunamadi: " + imza);
  var son = src.indexOf("\n  }", i);
  return src.slice(i, son + 4);
}
// ANIMASYONLAR sabiti + yardimcilar + buildAss gercek kaynaktan
var animBlok = (function () {
  var i = src.indexOf("var ANIMASYONLAR = {");
  var j = src.indexOf("};", i);
  return src.slice(i, j + 2);
})();
var kod = animBlok + "\n" + kes("function assCapa(") + "\n" + kes("function assRenk(") + "\n" +
  kes("function assTc(") + "\n" + kes("function assMetin(") + "\n" +
  kes("function assKaraokeSatirlari(") + "\n" + kes("function buildAss(") + "\n" +
  "; return { buildAss: buildAss, ANIMASYONLAR: ANIMASYONLAR };";

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 85) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 220) + "]"); }
}

var KELIMELER = [
  { start: 0.0, end: 0.55, text: "BİR" },
  { start: 0.55, end: 1.1, text: "İKİ" },
  { start: 1.1, end: 1.7, text: "ÜÇ" },
  { start: 1.7, end: 2.4, text: "DÖRT" }
];

function motor(stilNesnesi) {
  return new Function("cueler", "stil", kod)(
    function () { return KELIMELER; },
    function () { return stilNesnesi; }
  );
}

var ST = { font: "Arial", boyut: 110, renk: "#ffffff", konturRenk: "#000000",
           vurguRenk: "#ff0000", kontur: 5, konum: 2, kutu: false, animasyon: "yok" };

/* ================= 1) Yapısal doğrulama ================= */

function uret(anim, kelimeVerisi) {
  var m = motor(ST);
  return m.buildAss({ karaoke: kelimeVerisi !== false, animasyon: anim, genislik: 1280, yukseklik: 720 });
}

function olaylar(ass) {
  return ass.split("\n").filter(function (l) { return l.indexOf("Dialogue:") === 0; });
}

// karaoke: tek olay, \k etiketli
var aKar = uret("karaoke");
ok("karaoke: \\k etiketleri var", /\{\\k\d+\}/.test(aKar), (aKar.match(/\{\\k\d+\}/g) || []).length + " etiket");
ok("karaoke: satir basina TEK olay", olaylar(aKar).length === 1, olaylar(aKar).length + " olay");

// vurgu: kelime basina ARDISIK olay, ortusme yok
var aVur = uret("vurgu");
var oVur = olaylar(aVur);
ok("vurgu: kelime basina olay", oVur.length === KELIMELER.length, oVur.length + " olay");
ok("vurgu: renk degisimi + buyume etiketi var", /\\1c&H0000FF&|\\1c&H0000FF\\|\\fscx112/.test(aVur.replace(/&H000000FF/g, "&H0000FF")),
  (aVur.match(/\\1c[^\\}]*/g) || []).slice(0, 2).join(" "));
function ortusmeVar(evler) {
  var zam = evler.map(function (l) {
    var p = l.split(",");
    return { b: p[1], s: p[2] };
  });
  for (var i = 1; i < zam.length; i++) {
    if (zam[i].b < zam[i - 1].s) return true;   // ASS zaman bicimi alfabetik karsilastirilabilir
  }
  return false;
}
ok("vurgu: olaylar ORTUSMUYOR (cakisma kaydirmasi tetiklenmez)", !ortusmeVar(oVur), "ardisik pencereler");

// pop: birikimli metin — son olay tum kelimeleri icermeli, ilki tek kelime
var aPop = uret("pop");
var oPop = olaylar(aPop);
ok("pop: kelime basina olay", oPop.length === KELIMELER.length, oPop.length);
ok("pop: ilk olayda 1 kelime, son olayda hepsi",
  oPop[0].indexOf("DÖRT") === -1 && oPop[oPop.length - 1].indexOf("DÖRT") !== -1 &&
  oPop[oPop.length - 1].indexOf("BİR") !== -1, "birikimli");
ok("pop: buyume \\t etiketi + easing (accel<1) var", /\\fscx38\\fscy38\\t\(0,90,0\.55/.test(aPop), (aPop.match(/\\t\([^)]*\)/g) || [])[0]);
ok("pop: olaylar ortusmuyor", !ortusmeVar(oPop));

// bounce: cift \t (asma + oturma)
var aBou = uret("bounce");
ok("bounce: iki asamali \\t (tasma+oturma, easingli)", /\\t\(0,85,0\.5,[^)]*\\fscx124[^)]*\)\\t\(85,175,0\.8/.test(aBou),
  (aBou.match(/\{[^}]*fscx124[^}]*\}/) || ["?"])[0].slice(0, 80));

// akici: karaoke gibi TEK olay ama \kf (puruzsuz dolgu) etiketiyle
var aAki = uret("akici");
ok("akici: \\kf etiketleri var", /\{\\kf\d+\}/.test(aAki), (aAki.match(/\{\\kf\d+\}/g) || []).length + " etiket");
ok("akici: satir basina TEK olay", olaylar(aAki).length === 1, olaylar(aAki).length + " olay");
ok("akici: kesikli \\k YOK (yalniz \\kf)", !/\{\\k\d+\}/.test(aAki));

// yazim (daktilo): birikimli olaylar + yeni kelime harf harf \k + seffaf 2a numarasi
var aYaz = uret("yazim");
var oYaz = olaylar(aYaz);
ok("yazim: kelime basina olay", oYaz.length === KELIMELER.length, oYaz.length + " olay");
ok("yazim: gizleme numarasi var ({\\2a&HFF&})", /\{\\2a&HFF&\}/.test(aYaz));
ok("yazim: harf basina \\k dilimi var", (oYaz[0].match(/\{\\k\d+\}/g) || []).length >= 2,
  (oYaz[0].match(/\{\\k\d+\}/g) || []).length + " dilim ilk olayda");
ok("yazim: birikimli (son olay ilk kelimeyi de icerir)",
  oYaz[oYaz.length - 1].indexOf("BİR") !== -1);
ok("yazim: olaylar ortusmuyor", !ortusmeVar(oYaz));

// fade / slide: satir olaylari + etiket
var aFad = uret("fade");
ok("fade: \\fad etiketi var", /\{\\fad\(180,180\)\}/.test(aFad));
var aSli = uret("slide");
ok("slide: \\move + \\fad var", /\\move\(\d+,\d+,\d+,\d+,0,220\)/.test(aSli) && /\\fad\(150,0\)/.test(aSli),
  (aSli.match(/\\move\([^)]*\)/) || ["?"])[0]);

// konum 2'de move hedefi altta olmali (y = 720-90 = 630), baslangic 42px asagida
ok("slide: hedef capa dogru (alt-orta)", /\\move\(640,672,640,630,/.test(aSli),
  (aSli.match(/\\move\([^)]*\)/) || ["?"])[0]);

// kelime verisi YOKKEN kelimeli animasyon istenirse fade'e dusmeli
var aDus = uret("pop", false);
ok("kelime verisi yokken pop -> fade'e dusuyor", /\\fad\(180,180\)/.test(aDus) && !/\\fscx35/.test(aDus),
  "guvenli dusus");

// karaoke Primary=vurgu; vurgu animasyonunda Primary=normal renk
var stilSatirK = aKar.split("\n").filter(function (l) { return l.indexOf("Style: Suflo") === 0; })[0];
var stilSatirV = aVur.split("\n").filter(function (l) { return l.indexOf("Style: Suflo") === 0; })[0];
ok("karaoke: Primary=vurgu rengi", stilSatirK.indexOf("&H000000FF") !== -1, stilSatirK.slice(0, 60));
ok("vurgu: Primary=normal renk (aktif kelime satir icinde boyanir)",
  stilSatirV.indexOf("Suflo,Arial,110,&H00FFFFFF") !== -1, stilSatirV.slice(0, 60));

/* ================= 2) Görsel doğrulama: gerçek libass ================= */

function ffVar() { return cp.spawnSync(FF, ["-version"], { encoding: "utf8" }).status === 0; }

if (!ffVar()) {
  console.log("(ffmpeg yok - gorsel dogrulama atlandi)");
} else {
  /*
   * Aynı ASS'ten iki farklı anda kare al. Animasyonlu stilde kelime 0.6sn'de
   * ekleniyor/değişiyor → kareler farklı olmalı. "yok" stilinde satır sabit →
   * kareler AYNI olmalı (bu da testin kendisinin doğrulaması).
   */
  function kareCifti(anim, t1, t2) {
    var ass = uret(anim);
    var ad = "a-" + anim + ".ass";
    fs.writeFileSync(pathm.join(TMP, ad), ass, "utf8");
    var p1 = pathm.join(TMP, anim + "-1.png"), p2 = pathm.join(TMP, anim + "-2.png");
    var f = "subtitles=f=" + ad;
    var r1 = cp.spawnSync(FF, ["-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=3",
      "-vf", f, "-ss", String(t1), "-frames:v", "1", p1], { encoding: "utf8", cwd: TMP });
    var r2 = cp.spawnSync(FF, ["-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=3",
      "-vf", f, "-ss", String(t2), "-frames:v", "1", p2], { encoding: "utf8", cwd: TMP });
    if (r1.status !== 0 || r2.status !== 0) return null;
    try {
      return { a: fs.readFileSync(p1), b: fs.readFileSync(p2) };
    } catch (e) { return null; }
  }

  ["vurgu", "pop", "bounce", "karaoke"].forEach(function (anim) {
    var c = kareCifti(anim, 0.30, 1.35);
    if (!c) { ok(anim + ": render", false, "ffmpeg hata"); return; }
    ok(anim + ": iki anda kare FARKLI (animasyon canli)", Buffer.compare(c.a, c.b) !== 0,
      c.a.length + "B / " + c.b.length + "B");
  });

  // kontrol grubu: animasyonsuz stilde ayni satir araliginda kareler AYNI olmali
  var sabit = kareCifti("yok", 0.30, 0.50);
  if (sabit) {
    ok("yok: ayni cue icinde kareler AYNI (kontrol grubu)", Buffer.compare(sabit.a, sabit.b) === 0,
      sabit.a.length + "B");
  }

  /* pop görsel kanıtı: erken karede DÖRT yok, geç karede var (piksel sayısı artar) */
  function beyazSay(png) {
    var ham = png + ".rgb";
    cp.spawnSync(FF, ["-y", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgb24", ham], { encoding: "utf8" });
    var b = fs.readFileSync(ham);
    var n = 0;
    for (var i = 0; i < b.length; i += 3) if (b[i] > 200 && b[i + 1] > 200 && b[i + 2] > 200) n++;
    return n;
  }
  var erken = pathm.join(TMP, "pop-1.png"), gec = pathm.join(TMP, "pop-2.png");
  if (fs.existsSync(erken) && fs.existsSync(gec)) {
    var e = beyazSay(erken), g = beyazSay(gec);
    ok("pop: gec karede daha COK yazi pikseli (kelimeler birikiyor)", g > e * 1.5,
      "erken=" + e + " gec=" + g);
  }

  /* fontsdir + paket font: Bungee ile render, fallback'ten farkli olmali */
  var fontYol = KOKYOL + "fonts/Bungee.ttf";
  if (fs.existsSync(fontYol)) {
    fs.copyFileSync(fontYol, pathm.join(TMP, "Bungee.ttf"));
    var mB = motor(Object.assign({}, ST, { font: "Bungee" }));
    var assB = mB.buildAss({ karaoke: true, animasyon: "vurgu", genislik: 1280, yukseklik: 720 });
    fs.writeFileSync(pathm.join(TMP, "bungee.ass"), assB, "utf8");
    var pIle = pathm.join(TMP, "bungee-ile.png"), pSiz = pathm.join(TMP, "bungee-siz.png");
    cp.spawnSync(FF, ["-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=3",
      "-vf", "subtitles=f=bungee.ass:fontsdir=.", "-ss", "0.3", "-frames:v", "1", pIle], { encoding: "utf8", cwd: TMP });
    cp.spawnSync(FF, ["-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720:d=3",
      "-vf", "subtitles=f=bungee.ass", "-ss", "0.3", "-frames:v", "1", pSiz], { encoding: "utf8", cwd: TMP });
    if (fs.existsSync(pIle) && fs.existsSync(pSiz)) {
      ok("paket font fontsdir'den yukleniyor (fallback'ten farkli)",
        Buffer.compare(fs.readFileSync(pIle), fs.readFileSync(pSiz)) !== 0,
        "Bungee gercekten cizildi");
    }
  }
}

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
process.exit(kaldi ? 1 : 0);
