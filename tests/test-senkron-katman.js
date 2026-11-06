// Suflo testi: stilli katmanda kart sese yaslanmış KARESİNDE açılır (gerçek ffmpeg / libass; parti s3).
// Senkron doğrulama kart giriş / çıkışını sekansın karesine oturtur (29,97 fps'te kare 32 = 1,0677 sn). ASS santisaniye
// taşır, ffmpeg'in altyazı süzgeci karenin zamanını ms'ye keser: santisaniyeye yuvarlanan 1,07 kare 32'nin 1067 ms'sini
// geçer, kart bir kare GEÇ açılırdı. js/overlay-render.js kareZamanlari zamanları katman karesine oturtup libass payı
// kadar öne alır. Bu test stil motorunun GERÇEK zaman biçimini (SE.compile çıktısındaki Dialogue başları) alır, her kartı
// ayrı bir kutu olarak gerçek libass'le çizer ve kutunun göründüğü ilk / son kareyi okur (29,97 / 23,976 / 59,94 / 25 fps).
// Eski yol (kareZamanlari olmadan) aynı karelerde bir kare geç açılır: düzeltmenin kanıtı.
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var KOK = path.join(__dirname, "..");
var OR = require(path.join(KOK, "js", "overlay-render.js"));
var SE = require(path.join(KOK, "js", "style-engine.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
var ff = cp.spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
if (ff.error || !/\ssubtitles\s/.test(String(ff.stdout || ""))) { console.log("ATLA: libass'li ffmpeg yok"); console.log("0/0 gecti"); process.exit(0); }

var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-senkron-katman-"));
function tcAss(sn) {   // stil motorunun (style-engine.js timecode) biçimi
  var cs = Math.max(0, Math.round(Number(sn || 0) * 100));
  function p(n) { return n < 10 ? "0" + n : String(n); }
  return Math.floor(cs / 360000) + ":" + p(Math.floor((cs % 360000) / 6000)) + ":" + p(Math.floor((cs % 6000) / 100)) + "." + p(cs % 100);
}
var W = 8 * 8, H = 8;
function kutuAss(olaylar) {
  return ["[Script Info]", "ScriptType: v4.00+", "PlayResX: " + W, "PlayResY: " + H, "", "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: D,Arial,8,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1", "", "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"].concat(olaylar.map(function (o, i) {
    return "Dialogue: 0," + o.bas + "," + o.son + ",D,,0,0,0,,{\\an7\\pos(" + (i * 8) + ",0)\\p1}m 0 0 l 8 0 8 8 0 8{\\p0}";
  })).join("\n") + "\n";
}
// kutu i'nin göründüğü kareler (alfa > 0) → [ilk, son]
function ciz(ass, fps, sure, ad) {
  var dir = fs.mkdtempSync(path.join(kok, ad + "-"));
  fs.writeFileSync(path.join(dir, "altyazi.ass"), ass);
  var src = OR.kaynak({ g: W, y: H, fps: fps, sure: sure, assAd: "altyazi.ass" });
  var r = cp.spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", src, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { cwd: dir, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(String(r.stderr));
  var b = r.stdout, kareB = W * H * 4, n = Math.floor(b.length / kareB), sonuc = [];
  for (var i = 0; i < 8; i++) {
    var ilk = -1, son = -1;
    for (var k = 0; k < n; k++) {
      var a = b[k * kareB + (4 * W) * 4 + (i * 8 + 4) * 4 + 3];
      if (a > 0) { if (ilk < 0) ilk = k; son = k; }
    }
    sonuc.push([ilk, son]);
  }
  return sonuc;
}

[[30000 / 1001, "29,97"], [24000 / 1001, "23,976"], [60000 / 1001, "59,94"], [25, "25"]].forEach(function (fz) {
  var F = fz[0];
  // senkron doğrulamanın kareye oturmuş kart zamanları: eski yuvarlamanın geç açtığı kareler öncelikli (25 fps'te hiçbiri)
  var kareler = [];
  for (var k = 20; k < 2000 && kareler.length < 6; k++) {
    var t = k / F;
    if (kareler.length && k - kareler[kareler.length - 1] < 14) continue;
    if (Math.round(t * 100) * 10 > Math.floor(t * 1000 + 1e-9) || F === 25) kareler.push(k);
  }
  var cues = kareler.map(function (k, i) { return { start: k / F, end: (k + 9) / F, text: "kart " + (i + 1) }; });
  var kareCue = OR.kareZamanlari(cues, F, 0);
  var der = SE.compile({ styleId: SE.list()[0].id, cueKind: "lines", cues: kareCue, offset: 0, width: 1920, height: 1080 });
  var baslar = {};
  (der.ass.match(/^Dialogue: \d+,[^,]+,[^,]+/gm) || []).forEach(function (l) { baslar[l.split(",")[1]] = true; });
  var olaylar = kareCue.map(function (c) { return { bas: tcAss(c.start), son: tcAss(c.end) }; });
  ok(fz[1] + " fps: stil motoru kartları kareye oturmuş zamanlarla yazar (Dialogue başları)", olaylar.every(function (o) { return baslar[o.bas]; }), Object.keys(baslar).slice(0, 4).join(" "));
  var sure = (kareler[kareler.length - 1] + 14) / F;
  var yeni = ciz(kutuAss(olaylar), F, sure, "yeni");
  ok(fz[1] + " fps: her kart tam yaslanmış karesinde açılır ve çıkış karesinden bir önce kapanır (gerçek libass)",
    yeni.slice(0, kareler.length).every(function (x, i) { return x[0] === kareler[i] && x[1] === kareler[i] + 8; }), JSON.stringify(yeni.slice(0, kareler.length)) + " " + JSON.stringify(kareler));
  var eski = ciz(kutuAss(cues.map(function (c) { return { bas: tcAss(c.start), son: tcAss(c.end) }; })), F, sure, "eski");
  var gec = eski.slice(0, kareler.length).filter(function (x, i) { return x[0] !== kareler[i]; }).length;
  if (F === 25) ok("25 fps: kare zamanları santisaniyenin katı, eski yol da doğruydu (değişiklik zararsız)", gec === 0, JSON.stringify(eski));
  else ok(fz[1] + " fps: eski yol (santisaniyeye yuvarlama) aynı kartları bir kare geç açıyordu", gec === kareler.length, JSON.stringify(eski.slice(0, kareler.length)));
});

// 1 saatlik sekansın sonunda da (ffmpeg'in r=29.97 ızgarası 30000/1001'den birkaç ms sapar) kart karesinde açılır
(function () {
  var F = 30000 / 1001, k0 = 107800;
  var cues = [{ start: k0 / F, end: (k0 + 9) / F, text: "son" }];
  var kc = OR.kareZamanlari(cues, F, 0);
  var dir = fs.mkdtempSync(path.join(kok, "uzun-"));
  fs.writeFileSync(path.join(dir, "altyazi.ass"), kutuAss([{ bas: tcAss(kc[0].start), son: tcAss(kc[0].end) }]));
  // parça render'ının yolu: setpts=PTS+bas mutlak zamanı verir (js/overlay-render.js parcaKaynak)
  var src = OR.parcaKaynak({ w: W, h: H, fps: 29.97, bas: k0 - 4, kare: 20, assName: "altyazi.ass" });
  var r = cp.spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", src, "-frames:v", "20", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { cwd: dir, maxBuffer: 64 * 1024 * 1024 });
  var b = r.stdout, kareB = W * H * 4, ilk = -1;
  for (var k = 0; k * kareB < b.length; k++) if (b[k * kareB + (4 * W) * 4 + 4 * 4 + 3] > 0) { ilk = k; break; }
  ok("1 saatlik sekansın sonunda (parça render'ı, r=29.97): kart yine kendi karesinde açılır", r.status === 0 && ilk === 4, ilk + " " + String(r.stderr || "").slice(0, 120));
})();

ok("kareZamanlari: geçersiz fps'te cue'lar aynen (kopya), kelimeler de oturur, girdi değişmez", (function () {
  var c = [{ start: 1.0677, end: 2, text: "a", words: [{ start: 1.0677, end: 1.5, text: "a" }] }];
  var g = JSON.stringify(c);
  var y = OR.kareZamanlari(c, 0, 0), z = OR.kareZamanlari(c, 29.97, 0);
  return JSON.stringify(y) === g && y[0] !== c[0] && JSON.stringify(c) === g && Math.abs(z[0].words[0].start - (32 * 1001 / 30000 - OR.LIBASS_PAY)) < 1e-6 &&
    OR.kareZamanlari([{ start: 0, end: 0.02 }], 25, 0)[0].start === 0;
})());

try { fs.rmSync(kok, { recursive: true, force: true }); } catch (e) {}
console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
