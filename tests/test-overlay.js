var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * Şeffaf altyazı katmanı GERÇEKTEN üretiliyor ve GERÇEKTEN saydam mı?
 *
 * captions.js'teki gerçek buildAss çıktısı, panelin kullandığı ffmpeg komutunun
 * birebir aynısıyla render edilir. Sonra alfa üç ayrı yolla kanıtlanır:
 *   1) ffprobe pix_fmt alfalı bir format mı
 *   2) kırmızı zemine bindirilen kare ile mavi zemine bindirilen kare FARKLI mı
 *      (alfa yoksa video kendi zeminini taşır ve iki kare özdeş çıkar)
 *   3) yazının kendi rengi korunmuş mu
 *
 * Bu testin en kritik yakaladığı hata: subtitles filtresinde alpha=1 unutulursa
 * video tamamen görünmez çıkar ve bunu "dosya üretildi" kontrolü YAKALAYAMAZ.
 */
var fs = require("fs");
var os = require("os");
var pathm = require("path");
var cp = require("child_process");

var FF = process.argv[2] || "ffmpeg";
var TMP = pathm.join(os.tmpdir(), "suflo-overlay-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

var src = fs.readFileSync(KOKYOL + "js/captions.js", "utf8");
function kes(imza) {
  var i = src.indexOf(imza);
  if (i === -1) throw new Error("bulunamadi: " + imza);
  var son = src.indexOf("\n  }", i);
  return src.slice(i, son + 4);
}
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
  "; return { buildAss: buildAss };";

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 85) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 220) + "]"); }
}

function ffYok() {
  return cp.spawnSync(FF, ["-version"], { encoding: "utf8" }).status !== 0;
}
if (ffYok()) {
  console.log("(ffmpeg yok — overlay testi atlandi)");
  process.exit(0);
}

var G = 640, Y = 360, FPS = 25, SURE = 2;

// Karaoke etiketli, bilinen renkli altyazı üret (sarı yazı, mavi kontur)
var uret = new Function("cueler", "stil", kod)(
  function () {
    return [
      { start: 0.0, end: 0.5, text: "BIR" },
      { start: 0.5, end: 1.0, text: "IKI" },
      { start: 1.0, end: 1.5, text: "UC" }
    ];
  },
  function () {
    return { font: "Arial", boyut: 90, renk: "#ffff00", konturRenk: "#0000ff",
             vurguRenk: "#ff00ff", kontur: 5, konum: 2, kutu: false };
  }
);

var ass = uret.buildAss({ karaoke: true, genislik: G, yukseklik: Y });
fs.writeFileSync(pathm.join(TMP, "altyazi.ass"), ass, "utf8");

ok("ASS cikti cozunurluguyle ayni PlayRes kullaniyor",
  ass.indexOf("PlayResX: " + G) !== -1 && ass.indexOf("PlayResY: " + Y) !== -1,
  (ass.match(/PlayRes[XY]: \d+/g) || []).join(" "));
ok("YCbCr Matrix: None var (beyaz 235 degil 255 cizilsin)",
  ass.indexOf("YCbCr Matrix: None") !== -1);

/* ---------- Panelin kullandığı komutun birebir aynısı ---------- */
var mov = pathm.join(TMP, "overlay.mov");
var kaynak = "color=c=black@0.0:s=" + G + "x" + Y + ":r=" + FPS + ":d=" + SURE +
  ",format=rgba,subtitles=f=altyazi.ass:alpha=1,unpremultiply=inplace=1";
var r = cp.spawnSync(FF, ["-y", "-f", "lavfi", "-i", kaynak, "-c:v", "qtrle", "-an", mov],
  { encoding: "utf8", cwd: TMP });

ok("overlay uretildi", r.status === 0 && fs.existsSync(mov),
  String(r.stderr || "").split("\n").slice(-2).join(" ").slice(0, 140));

if (fs.existsSync(mov)) {
  var mb = fs.statSync(mov).size / 1048576;
  ok("dosya makul boyutta (qtrle sikistiriyor)", mb < 8, mb.toFixed(2) + " MB / " + SURE + " sn");

  /* KANIT 1: pix_fmt alfalı mı */
  var pr = cp.spawnSync(FF.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"),
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt,codec_tag_string",
     "-of", "default=nw=1", mov], { encoding: "utf8" });
  var bilgi = String(pr.stdout || "");
  if (pr.status === 0 && bilgi) {
    ok("pix_fmt alfa iceriyor", /argb|rgba|yuva|bgra/i.test(bilgi), bilgi.replace(/\s+/g, " ").trim());
  } else {
    ok("pix_fmt okunamadi (ffprobe yok) - atlandi", true, "ffprobe bulunamadi");
  }

  /* KANIT 2: farklı zeminlerde farklı görünüyor mu (asıl alfa kanıtı) */
  function zeminUstunde(renk, ad) {
    var png = pathm.join(TMP, ad);
    var k = cp.spawnSync(FF, ["-y", "-f", "lavfi", "-i", "color=c=" + renk + ":s=" + G + "x" + Y + ":d=1",
      "-i", mov, "-filter_complex", "[0][1]overlay=format=auto", "-frames:v", "1", png],
      { encoding: "utf8" });
    if (k.status !== 0 || !fs.existsSync(png)) return null;
    var ham = png.replace(/\.png$/, ".rgb");
    cp.spawnSync(FF, ["-y", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgb24", ham], { encoding: "utf8" });
    return fs.existsSync(ham) ? fs.readFileSync(ham) : null;
  }

  var kirmiziZemin = zeminUstunde("red", "k.png");
  var maviZemin = zeminUstunde("blue", "m.png");

  if (kirmiziZemin && maviZemin) {
    var farkli = 0, kirmiziKalan = 0, maviKalan = 0, sari = 0;
    for (var i = 0; i < kirmiziZemin.length; i += 3) {
      var r1 = kirmiziZemin[i], g1 = kirmiziZemin[i + 1], b1 = kirmiziZemin[i + 2];
      var r2 = maviZemin[i], g2 = maviZemin[i + 1], b2 = maviZemin[i + 2];
      if (Math.abs(r1 - r2) > 40 || Math.abs(b1 - b2) > 40) farkli++;
      if (r1 > 180 && g1 < 70 && b1 < 70) kirmiziKalan++;
      if (b2 > 180 && r2 < 70 && g2 < 70) maviKalan++;
      if (r1 > 180 && g1 > 180 && b1 < 90) sari++;      // yazının kendi rengi
    }
    var toplam = kirmiziZemin.length / 3;

    ok("ALFA GERCEK: iki zeminde kare FARKLI",
      farkli > toplam * 0.5, Math.round(farkli / toplam * 100) + "% piksel farkli");
    ok("zemin gorunuyor (altyazi disi saydam)",
      kirmiziKalan > toplam * 0.5 && maviKalan > toplam * 0.5,
      "kirmizi " + Math.round(kirmiziKalan / toplam * 100) + "% / mavi " + Math.round(maviKalan / toplam * 100) + "%");
    ok("YAZI kendi renginde (sari) cizildi", sari > 50, sari + " sari piksel");
  } else {
    ok("zemin bindirmesi yapilamadi", false, "overlay filtresi calismadi");
  }

  /* KANIT 3: alpha=1 OLMADAN gercekten bozuluyor mu (testin kendisi ise yariyor mu) */
  var kotu = pathm.join(TMP, "alfasiz.mov");
  cp.spawnSync(FF, ["-y", "-f", "lavfi", "-i",
    "color=c=black@0.0:s=" + G + "x" + Y + ":r=" + FPS + ":d=1,format=rgba,subtitles=f=altyazi.ass",
    "-c:v", "qtrle", "-an", kotu], { encoding: "utf8", cwd: TMP });

  if (fs.existsSync(kotu)) {
    var pngK = pathm.join(TMP, "alfasiz.png");
    cp.spawnSync(FF, ["-y", "-f", "lavfi", "-i", "color=c=red:s=" + G + "x" + Y + ":d=1",
      "-i", kotu, "-filter_complex", "[0][1]overlay=format=auto", "-frames:v", "1", pngK], { encoding: "utf8" });
    var hamK = pathm.join(TMP, "alfasiz.rgb");
    cp.spawnSync(FF, ["-y", "-i", pngK, "-f", "rawvideo", "-pix_fmt", "rgb24", hamK], { encoding: "utf8" });
    if (fs.existsSync(hamK)) {
      var bk = fs.readFileSync(hamK);
      var sariK = 0;
      for (var j = 0; j < bk.length; j += 3) {
        if (bk[j] > 180 && bk[j + 1] > 180 && bk[j + 2] < 90) sariK++;
      }
      // alpha=1 olmadan libass alfayı işlemez: yazı hiç görünmez
      ok("alpha=1 OLMADAN yazi kayboluyor (bayrak gercekten sart)",
        sariK < 50, "alfasiz surumde " + sariK + " sari piksel");
    }
  }
}

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
process.exit(kaldi ? 1 : 0);
