// Suflo testi: Shorts paketi ekleri — js/shorts-ekler.js (ilerleme çubuğu, CTA, tek ASS) ve
// hook-title.js'in "alt" konumu / stil adı; libass ile gerçek render ölçümleri
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var E = require(path.join(__dirname, "..", "js", "shorts-ekler.js"));
var HT = require(path.join(__dirname, "..", "js", "hook-title.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 220) + "]" : "")); }

/* ---------------- geometri ---------------- */
var W = 1080, H = 1920;
var ust = E.progressGeometry({ W: W, H: H, konum: "ust", kalinlik: 8 });
var alt = E.progressGeometry({ W: W, H: H, konum: "alt", kalinlik: 8 });
ok("dikey üst: durum çubuğunun (%7) altında, tam genişlik", ust.y >= Math.ceil(H * 0.07) && ust.x === 0 && ust.w === W, JSON.stringify(ust));
ok("dikey alt: açıklama alanının (%78) üstünde, ikon sütununun (%87) solunda", alt.y + alt.h <= Math.floor(H * 0.78) && alt.x + alt.w <= Math.floor(W * 0.87), JSON.stringify(alt));
var kalin = E.progressGeometry({ W: W, H: H, stil: "kalin", kalinlik: 8 }), kapsul = E.progressGeometry({ W: W, H: H, stil: "kapsul", kalinlik: 8 });
ok("stiller: kalın > ince, kapsül yuvarlak ve kenardan içeride", kalin.h > ust.h && kapsul.r === kapsul.h / 2 && kapsul.x > 0 && kapsul.x + kapsul.w < W, JSON.stringify([kalin, kapsul]));
var yatay = E.progressGeometry({ W: 1920, H: 1080, konum: "alt", kalinlik: 8 });
ok("yatay: alt kenara dayalı, tam genişlik", yatay.y + yatay.h === 1080 && yatay.w === 1920, JSON.stringify(yatay));
ok("geçersiz değerler: ince / üst / sınırlı kalınlık", (function () {
  var g = E.progressGeometry({ W: W, H: H, stil: "yok", konum: "?", kalinlik: 999 });
  return g.stil === "ince" && g.konum === "ust" && g.h <= Math.round(24 * 0.75) + 1;
})());

/* ---------------- olaylar ---------------- */
var pb = E.progressBarEvents({ W: W, H: H, dur: 10, renk: "#ff0000", kalinlik: 8, konum: "ust" });
ok("çubuk: zemin + dolgu olayı, dolgu \\clip'i 0'dan tam genişliğe \\t ile açar",
  pb.events.length === 2 && /\\clip\(0,0,0,1920\)\\t\(0,10000,\\clip\(0,0,1080,1920\)\)/.test(pb.events[1]), pb.events[1]);
ok("çubuk: renk ASS sırasıyla (BGR)", /\\1c&H0000FF&/.test(pb.events[1]));
ok("çubuk: geçersiz renk varsayılana döner", /\\1c&HF67C8B&/.test(E.progressBarEvents({ W: W, H: H, dur: 5, renk: "kırmızı" }).events[1]));

ok("ctaMetni: altyazı dillerinde hazır metin, hazırı olmayanda İngilizce", E.ctaMetni("takip", "", "de") === "Folge für mehr" &&
  E.ctaMetni("link", "", "es") === "Enlace en la descripción" && E.ctaMetni("part2", "", "ru") === "Часть 2 в профиле" && E.ctaMetni("takip", "", "az") === "Abunə ol" &&
  E.ctaMetni("takip", "", "ja") === "Follow for more" && E.ctaDiliVar("fr") && !E.ctaDiliVar("ja") && !E.ctaDiliVar("toString") &&
  ["tr", "en", "az", "de", "es", "fr", "pt", "it", "ru", "ar"].every(function (l) { return ["takip", "part2", "link"].every(function (x) { var t = E.ctaMetni(x, "", l); return t && t.length <= 40; }); }));
ok("ctaMetni: hazır metin videonun dilinde, özel metin ≤40 ve emojisiz",
  E.ctaMetni("takip", "", "tr") === "Takip et" && E.ctaMetni("link", "", "en") === "Link in description" &&
  E.ctaMetni("ozel", "Abone ol 🔥 ve bildirimleri aç lütfen çok önemli gerçekten", "tr").length <= 40 &&
  E.ctaMetni("ozel", "Abone ol 🔥", "tr") === "Abone ol" && E.ctaMetni("bilinmeyen", "", "tr") === "");
ok("ctaKonum: altyazı altta ise CTA üstte", E.ctaKonum(2, true) === "ust" && E.ctaKonum(5, true) === "alt" && E.ctaKonum(2, false) === "alt");

var cta = E.ctaEvents({ W: W, H: H, dur: 20, metin: "Takip et", sure: 3, hookDur: 3, lang: "tr" });
ok("CTA: son N saniye (20 sn'lik klipte 17. sn'den)", cta.ass && Math.abs(cta.start - 17) < 1e-6 && Math.abs(cta.end - 20) < 1e-6, JSON.stringify([cta.start, cta.end, cta.atla]));
ok("CTA: stil adı 'Cta' (kanca 'Kanca' ile çakışmaz)", /^Style: Cta,/m.test(cta.ass) && !/^Style: Kanca,/m.test(cta.ass) && /,Cta,,0,0,0,,/.test(cta.ass));
ok("CTA: 8 sn'den kısa klipte yok", E.ctaEvents({ W: W, H: H, dur: 7.9, metin: "Takip et" }).atla === "kisa");
ok("CTA: kancayla çakışırsa yok", E.ctaEvents({ W: W, H: H, dur: 8, metin: "Takip et", sure: 4, hookDur: 5 }).atla === "cakisma");
ok("CTA: boş metin yok", E.ctaEvents({ W: W, H: H, dur: 30, metin: "  " }).atla === "bos");

/* ---------------- hook-title: alt konum ve stil adı ---------------- */
var hUst = HT.build({ text: "Takip et", stil: "serit", width: W, height: H, dur: 3 });
var hAlt = HT.build({ text: "Takip et", stil: "serit", width: W, height: H, dur: 3, konum: "alt" });
function ilkY(ass) { var m = /\\(?:pos|move)\(\d+,(\d+)/.exec(ass); return m ? Number(m[1]) : -1; }
ok("kanca 'alt': blok alt arayüzün (%78) üstünde, 'ust'ten aşağıda", ilkY(hAlt.ass) > ilkY(hUst.ass) && ilkY(hAlt.ass) < H * 0.78, ilkY(hUst.ass) + " / " + ilkY(hAlt.ass));
ok("kanca: styleName yalnız geçerli adla; varsayılan 'Kanca'", /^Style: Kanca,/m.test(hUst.ass) &&
  /^Style: Cta,/m.test(HT.build({ text: "a", styleName: "Cta" }).ass) && /^Style: Kanca,/m.test(HT.build({ text: "a", styleName: "x,y{" }).ass));

/* ---------------- tek ASS ---------------- */
var hook = HT.build({ text: "Bunu *bil*", stil: "kutu", width: W, height: H, dur: 3 });
var eskiCta = HT.build({ text: "Takip et", stil: "serit", width: W, height: H, dur: 3, konum: "alt" });   // "Kanca" adlı
var cer = E.composeFrameAss({ W: W, H: H, hookAss: hook.ass, ctaAss: eskiCta.ass, ctaStart: 7, progress: E.progressBarEvents({ W: W, H: H, dur: 10, konum: "alt" }) });
ok("birleşik: PlayRes korunur", /^PlayResX: 1080$/m.test(cer) && /^PlayResY: 1920$/m.test(cer));
ok("birleşik: Kanca, Cta ve Ilerleme stilleri ayrı", ["Kanca", "Cta", "Ilerleme"].every(function (s) { return new RegExp("^Style: " + s + ",", "m").test(cer); }) &&
  (cer.match(/^Style: /gm) || []).length === 3);
var kancaOlay = cer.split("\n").filter(function (l) { return /^Dialogue: \d+,[^,]*,[^,]*,Kanca,/.test(l); });
var ctaOlay = cer.split("\n").filter(function (l) { return /^Dialogue: \d+,[^,]*,[^,]*,Cta,/.test(l); });
ok("birleşik: kanca 0. saniyede kalır", kancaOlay.length > 0 && kancaOlay.every(function (l) { return /^Dialogue: \d+,0:00:0[0-3]\.\d\d,0:00:0[0-3]\.\d\d,/.test(l); }), kancaOlay[0]);
ok("birleşik: CTA olayları 7 sn kaydı", ctaOlay.length > 0 && ctaOlay.every(function (l) { return /^Dialogue: \d+,0:00:(0[7-9]|10)\.\d\d,0:00:(0[7-9]|10)\.\d\d,Cta,/.test(l); }), ctaOlay[0]);
ok("birleşik: yalnız çubuk da geçerli ASS", /\[Events\]/.test(E.composeFrameAss({ W: W, H: H, progress: pb })) && E.composeFrameAss({ W: W, H: H }).indexOf("Dialogue") === -1);
ok("renameStyle: yalnız adı tam eşleşen stil", E.renameStyle("Style: Kanca,A\nStyle: Kanca2,B\nDialogue: 0,0:00:00.00,0:00:01.00,Kanca,,0,0,0,,x", "Kanca", "Cta") ===
  "Style: Cta,A\nStyle: Kanca2,B\nDialogue: 0,0:00:00.00,0:00:01.00,Cta,,0,0,0,,x");

/* ---------------- libass ile gerçek render ---------------- */
var ff = null;
try { cp.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); ff = "ffmpeg"; } catch (e) {}
if (!ff) {
  console.log("ATLA render: ffmpeg yok");
} else {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-shorts-ekler-"));
  function kare(assAd, w, h, sn, sure) {
    return cp.execFileSync(ff, ["-v", "error", "-f", "lavfi", "-i", "color=c=black@0.0:s=" + w + "x" + h + ":r=10:d=" + sure +
      ",format=rgba,subtitles=f=" + assAd + ":alpha=1:fontsdir=.", "-ss", String(sn), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
      { cwd: dir, maxBuffer: 1 << 26 });
  }
  try {
    ["ust", "alt"].forEach(function (konum) {
      var p = E.progressBarEvents({ W: W, H: H, dur: 10, renk: "#ff0000", kalinlik: 8, konum: konum });
      fs.writeFileSync(path.join(dir, "pb-" + konum + ".ass"), E.composeFrameAss({ W: W, H: H, progress: p }));
      var g = p.geo, satir = g.y + Math.floor(g.h / 2);
      [[0.5, 0.05], [5, 0.5], [9.9, 0.99]].forEach(function (o) {
        var raw = kare("pb-" + konum + ".ass", W, H, o[0], 10);
        var dolu = 0;
        for (var x = g.x; x < g.x + g.w; x++) { var i = (satir * W + x) * 4; if (raw[i] > 200 && raw[i + 1] < 60 && raw[i + 3] > 200) dolu++; }
        var oran = dolu / g.w;
        ok("render " + konum + ": " + o[0] + " sn'de dolgu ≈ %" + Math.round(o[1] * 100) + " (±3)", Math.abs(oran - o[1]) <= 0.03, (oran * 100).toFixed(1) + "%");
      });
      var raw2 = kare("pb-" + konum + ".ass", W, H, 5, 10), disari = 0, zemin = 0;
      for (var y = 0; y < H; y++) {
        for (var x2 = 0; x2 < W; x2++) {
          var a = raw2[(y * W + x2) * 4 + 3];
          var icinde = y >= g.y && y < g.y + g.h && x2 >= g.x && x2 < g.x + g.w;
          if (!icinde && a > 0) disari++;
          if (icinde && x2 > g.x + g.w * 0.75 && a > 40 && a < 220) zemin++;
        }
      }
      ok("render " + konum + ": çubuk dışı tamamen şeffaf", disari === 0, disari);
      ok("render " + konum + ": dolmamış kısımda yarı saydam zemin", zemin > g.w * 0.2 * g.h * 0.5, zemin);
      var guvenli = konum === "ust" ? g.y >= Math.ceil(H * 0.07) : (g.y + g.h <= Math.floor(H * 0.78) && g.x + g.w <= Math.floor(W * 0.87));
      ok("render " + konum + ": çubuk güvenli alanda", guvenli, JSON.stringify(g));
    });

    // kanca (0-3 sn) + CTA (son 3 sn) + çubuk tek ASS'te; fontlar paketten
    var D = 12, w2 = 540, h2 = 960;
    var hk = HT.build({ text: "Bunu *bil*", stil: "kutu", width: w2, height: h2, dur: 3 });
    var ct = E.ctaEvents({ W: w2, H: h2, dur: D, metin: "Takip et", sure: 3, hookDur: 3, lang: "tr" });
    var tek = E.composeFrameAss({ W: w2, H: h2, hookAss: hk.ass, ctaAss: ct.ass, ctaStart: ct.start, progress: E.progressBarEvents({ W: w2, H: h2, dur: D }) });
    fs.writeFileSync(path.join(dir, "cer.ass"), tek);
    hk.fontFiles.concat(ct.fontFiles).forEach(function (f) { fs.copyFileSync(path.join(__dirname, "..", "fonts", f), path.join(dir, f)); });
    function opakSay(raw, y0, y1) {
      var n = 0;
      for (var y3 = y0; y3 < y1; y3++) for (var x3 = 0; x3 < w2; x3++) if (raw[(y3 * w2 + x3) * 4 + 3] > 200) n++;
      return n;
    }
    var g2 = E.progressGeometry({ W: w2, H: h2 });
    var bandBas = g2.y + g2.h + 2;   // çubuğun altı: yalnız kanca / CTA
    var r1 = kare("cer.ass", w2, h2, 1, D), rOrta = kare("cer.ass", w2, h2, 6, D), rSon = kare("cer.ass", w2, h2, D - 1, D);
    ok("tek render: 1. sn'de kanca görünür", opakSay(r1, bandBas, h2) > 1500, opakSay(r1, bandBas, h2));
    ok("tek render: ortada ne kanca ne CTA", opakSay(rOrta, bandBas, h2) === 0, opakSay(rOrta, bandBas, h2));
    ok("tek render: son saniyede CTA görünür (alt yarıda)", opakSay(rSon, Math.round(h2 / 2), h2) > 800, opakSay(rSon, Math.round(h2 / 2), h2));
  } catch (eR) {
    ok("render çalıştı", false, eR.message);
  }
  try { fs.readdirSync(dir).forEach(function (f) { fs.unlinkSync(path.join(dir, f)); }); fs.rmdirSync(dir); } catch (eD) {}
}

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
