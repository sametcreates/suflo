var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * Panelde seçilen görünüm, GERÇEKTEN videoya öyle mi çiziliyor?
 *
 * captions.js'teki gerçek assRenk() ve buildAss() kaynağı kesilip çalıştırılır,
 * üretilen ASS ffmpeg/libass ile karelere render edilir ve piksel renkleri ölçülür.
 * Önizlemenin yalan söylememesi buna bağlı: kullanıcı kırmızı seçtiyse kare
 * kırmızı olmalı, üst dediyse yazı üstte olmalı.
 */
var fs = require("fs");
var os = require("os");
var pathm = require("path");
var cp = require("child_process");

var FF = process.argv[2] || "ffmpeg";
var TMP = pathm.join(os.tmpdir(), "suflo-stil-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

var src = fs.readFileSync(KOKYOL + "js/captions.js", "utf8");

function kes(imza) {
  var i = src.indexOf(imza);
  if (i === -1) throw new Error("bulunamadi: " + imza);
  var son = src.indexOf("\n  }", i);
  if (son === -1) throw new Error("kapanis yok: " + imza);
  return src.slice(i, son + 4);
}

/* assRenk + buildAss gerçek kaynaktan; buildAss'in bağımlılıkları taklit edilir */
  var animBlok = (function () {
    var i = src.indexOf("var ANIMASYONLAR = {");
    var j = src.indexOf("};", i);
    return src.slice(i, j + 2);
  })();
var kod = animBlok + "\n" + kes("function assCapa(") + "\n" +
  kes("function assRenk(") + "\n" + kes("function buildAss(") + "\n" +
  kes("function assTc(") + "\n" + kes("function assMetin(") + "\n" +
  kes("function assKaraokeSatirlari(") + "\n" + kes("function stilRecetesi(") + "\n" +
  kes("function yogunlukCarpani(") + "\n" + kes("function vurguKelimesi(") + "\n" +
  "; return { assRenk: assRenk, buildAss: buildAss };";

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 80) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

// buildAss'in kullandığı dış işlevler: verilen cue listesini aynen döndür
function kur(cueler, stilNesnesi) {
  var f = new Function("cueler", "stil", kod);
  return f(function () { return cueler; }, function () { return stilNesnesi; });
}

var STIL_VARSAYILAN = {
  font: "Arial", boyut: 72, renk: "#ffffff", konturRenk: "#000000",
  vurguRenk: "#8b7cf6", kontur: 4, konum: 2, kutu: false
};

/* ================= 1) Renk dönüşümü ================= */

var m = kur([], STIL_VARSAYILAN);

/*
 * ASS &HAABBGGRR kullanır: HTML'in TERSİ bayt sırası. Bu tersliğin
 * kaçırılması en sinsi hata olurdu — kırmızı seçilip mavi çıkardı.
 */
ok("beyaz", m.assRenk("#ffffff") === "&H00FFFFFF", m.assRenk("#ffffff"));
ok("siyah", m.assRenk("#000000") === "&H00000000", m.assRenk("#000000"));
ok("KIRMIZI ters cevrildi (#ff0000 -> &H000000FF)", m.assRenk("#ff0000") === "&H000000FF", m.assRenk("#ff0000"));
ok("MAVI ters cevrildi (#0000ff -> &H00FF0000)", m.assRenk("#0000ff") === "&H00FF0000", m.assRenk("#0000ff"));
ok("yesil ortada kalir", m.assRenk("#00ff00") === "&H0000FF00", m.assRenk("#00ff00"));
ok("mor vurgu", m.assRenk("#8b7cf6") === "&H00F67C8B", m.assRenk("#8b7cf6"));
ok("kisa biçim #fff genisletiliyor", m.assRenk("#fff") === "&H00FFFFFF", m.assRenk("#fff"));
ok("saydamlik baytı basa yaziliyor", m.assRenk("#000000", 0x80) === "&H80000000", m.assRenk("#000000", 0x80));

/* ================= 2) Stil satırı panel değerlerini taşıyor mu ================= */

var cue = [{ start: 0.2, end: 2.4, text: "deneme metni" }];

function stilSatiri(ass) {
  return ass.split("\n").filter(function (l) { return l.indexOf("Style: Suflo,") === 0; })[0] || "";
}

var a1 = kur(cue, { font: "Impact", boyut: 110, renk: "#ff0000", konturRenk: "#00ff00",
                    vurguRenk: "#0000ff", kontur: 7, konum: 8, kutu: false }).buildAss({});
var s1 = stilSatiri(a1);
ok("font stil satirina gecti", s1.indexOf(",Impact,") !== -1, s1);
ok("punto gecti", s1.indexOf(",110,") !== -1, s1);
ok("yazi rengi (kirmizi) gecti", s1.indexOf("&H000000FF") !== -1, s1);
ok("kontur rengi (yesil) gecti", s1.indexOf("&H0000FF00") !== -1, s1);
ok("kontur kalinligi gecti", /,1,7,/.test(s1), s1);
ok("konum (ust=8) gecti", /,8,80,80,/.test(s1), s1);

var a2 = kur(cue, { font: "Arial", boyut: 64, renk: "#ffffff", konturRenk: "#000000",
                    vurguRenk: "#8b7cf6", kontur: 0, konum: 2, kutu: true }).buildAss({});
var s2 = stilSatiri(a2);
ok("arka plan kutusu BorderStyle 3 yapiyor", /,3,0,0,/.test(s2), s2);
ok("kutu acikken golge kapaniyor", /,3,0,0,2,/.test(s2), s2);

/* karaoke: vurgu rengi PrimaryColour olmali (\k soldurma Secondary'den Primary'ye gider) */
var a3 = kur([{ start: 0, end: .5, text: "bir" }, { start: .5, end: 1, text: "iki" }],
             { font: "Arial", boyut: 72, renk: "#ffffff", konturRenk: "#000000",
               vurguRenk: "#ff0000", kontur: 4, konum: 2, kutu: false }).buildAss({ karaoke: true });
var s3 = stilSatiri(a3);
ok("karaoke: vurgu rengi Primary'de", s3.indexOf("Suflo,Arial,72,&H000000FF") !== -1, s3);
ok("karaoke: normal renk Secondary'de", s3.indexOf("&H000000FF,&H00FFFFFF") !== -1, s3);
ok("karaoke \\k etiketi uretildi", /\{\\k\d+\}/.test(a3), (a3.match(/\{\\k\d+\}[^\\]*/g) || []).slice(0, 2).join(" "));

/* ================= 3) GERÇEK RENDER: libass ne çiziyor ================= */

function ffVar() {
  var r = cp.spawnSync(FF, ["-version"], { encoding: "utf8" });
  return r.status === 0;
}

if (!ffVar()) {
  console.log("\n(ffmpeg yok — render dogrulamasi atlandi)");
} else {
  // Kırmızı yazı / mavi kontur, üstte; siyah zemine render edip pikselleri ölç
  var assYol = pathm.join(TMP, "test.ass");
  var render = kur([{ start: 0.0, end: 3.0, text: "RENK TESTI" }], {
    font: "Arial", boyut: 140, renk: "#ff0000", konturRenk: "#0000ff",
    vurguRenk: "#00ff00", kontur: 6, konum: 8, kutu: false
  }).buildAss({});
  fs.writeFileSync(assYol, render, "utf8");

  /*
   * ffmpeg'in altyazı filtresine MUTLAK yol verilemiyor: filtre sözdiziminde ":"
   * parametre ayracı olduğu için "C:/..." ikinci parametre sanılıyor ve
   * "Error applying option 'original_size'" hatası veriyor. Ters bölüyle kaçırmak
   * da çözmüyor. Çalışan tek yol: ffmpeg'i dosyanın klasöründe çalıştırmak.
   */
  var kare = pathm.join(TMP, "kare.png");
  var r = cp.spawnSync(FF, ["-y", "-f", "lavfi", "-i", "color=c=black:s=1920x1080:d=1",
    "-vf", "ass=test.ass", "-frames:v", "1", kare], { encoding: "utf8", cwd: TMP });

  ok("libass ASS dosyasini kabul etti", r.status === 0 && fs.existsSync(kare),
    String(r.stderr || "").split("\n").slice(-2).join(" ").slice(0, 120));

  if (fs.existsSync(kare)) {
    // Kareyi ham RGB'ye çevirip renk say
    var ham = pathm.join(TMP, "kare.rgb");
    cp.spawnSync(FF, ["-y", "-i", kare, "-f", "rawvideo", "-pix_fmt", "rgb24", ham], { encoding: "utf8" });
    var buf = fs.readFileSync(ham);
    var G = 1920, Y = 1080;

    var kirmizi = 0, mavi = 0, ustYari = 0, altYari = 0;
    for (var y = 0; y < Y; y += 2) {
      for (var x = 0; x < G; x += 2) {
        var i = (y * G + x) * 3;
        var R = buf[i], Gc = buf[i + 1], B = buf[i + 2];
        if (R > 180 && Gc < 80 && B < 80) { kirmizi++; if (y < Y / 2) ustYari++; else altYari++; }
        if (B > 180 && R < 80 && Gc < 80) mavi++;
      }
    }

    ok("YAZI kirmizi cizildi (secilen renk)", kirmizi > 200, kirmizi + " kirmizi piksel");
    ok("KONTUR mavi cizildi (secilen kontur rengi)", mavi > 100, mavi + " mavi piksel");
    ok("konum UST secildi, yazi ust yarida", ustYari > altYari * 4,
      "ust=" + ustYari + " alt=" + altYari);
  }

  // Aynı metni ALTA alıp yer değiştirdiğini kanıtla
  var assAlt = pathm.join(TMP, "alt.ass");
  fs.writeFileSync(assAlt, kur([{ start: 0, end: 3, text: "RENK TESTI" }], {
    font: "Arial", boyut: 140, renk: "#ff0000", konturRenk: "#0000ff",
    vurguRenk: "#00ff00", kontur: 6, konum: 2, kutu: false
  }).buildAss({}), "utf8");

  var kareAlt = pathm.join(TMP, "kare-alt.png");
  cp.spawnSync(FF, ["-y", "-f", "lavfi", "-i", "color=c=black:s=1920x1080:d=1",
    "-vf", "ass=alt.ass", "-frames:v", "1", kareAlt], { encoding: "utf8", cwd: TMP });

  if (fs.existsSync(kareAlt)) {
    var hamAlt = pathm.join(TMP, "alt.rgb");
    cp.spawnSync(FF, ["-y", "-i", kareAlt, "-f", "rawvideo", "-pix_fmt", "rgb24", hamAlt], { encoding: "utf8" });
    var b2 = fs.readFileSync(hamAlt);
    var u2 = 0, a2s = 0;
    for (var y2 = 0; y2 < 1080; y2 += 2) {
      for (var x2 = 0; x2 < 1920; x2 += 2) {
        var j = (y2 * 1920 + x2) * 3;
        if (b2[j] > 180 && b2[j + 1] < 80 && b2[j + 2] < 80) { if (y2 < 540) u2++; else a2s++; }
      }
    }
    ok("konum ALT secilince yazi alt yarida", a2s > u2 * 4, "ust=" + u2 + " alt=" + a2s);
  }
}

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
process.exit(kaldi ? 1 : 0);
