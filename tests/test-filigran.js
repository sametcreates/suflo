// Suflo testi: js/filigran.js — deneme render filigranı (yalnız stilli katman ve kanca başlığı)
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var F = require(path.join(__dirname, "..", "js", "filigran.js"));
var SE = require(path.join(__dirname, "..", "js", "style-engine.js"));
var HT = require(path.join(__dirname, "..", "js", "hook-title.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

function satirlar(s) { return s.split(/\r?\n/); }
function eklenen(once, sonra) {
  var a = satirlar(once), kalan = satirlar(sonra).slice();
  a.forEach(function (l) { var i = kalan.indexOf(l); if (i !== -1) kalan.splice(i, 1); });
  return kalan;
}
function stilSatiri(ass) { return satirlar(ass).filter(function (l) { return /^Style:\s*SufloFiligran,/.test(l); })[0] || ""; }
function olaySatiri(ass) { return satirlar(ass).filter(function (l) { return /^Dialogue:.*SufloFiligran/.test(l); })[0] || ""; }
function posY(ass) { var m = /\\pos\((\d+),(\d+)\)/.exec(olaySatiri(ass)); return m ? [Number(m[1]), Number(m[2])] : [0, 0]; }

var cues = [{ start: 0, end: 1.2, text: "Bunu sakın kaçırma" }, { start: 1.3, end: 61.75, text: "Uzun ikinci satır" }];
function motor(w, h) { return SE.compile({ styleId: "mrbeast", intensity: 1, cueKind: "line", cues: cues, offset: 0, width: w, height: h, overrides: {} }).ass; }

/* ---------------- yapı ---------------- */
var yatay = motor(1920, 1080), dikey = motor(1080, 1920);
var fy = F.ekle(yatay, { width: 1920, height: 1080 }), fd = F.ekle(dikey, { width: 1080, height: 1920 });
var ek = eklenen(yatay, fy);
ok("tam olarak bir stil ve bir olay eklenir", ek.length === 2 &&
  ek.filter(function (l) { return /^Style: SufloFiligran,/.test(l); }).length === 1 &&
  ek.filter(function (l) { return /^Dialogue: /.test(l); }).length === 1, JSON.stringify(ek));
ok("özgün satırların hepsi bayt bayt aynı ve aynı sırada", satirlar(fy).filter(function (l) { return ek.indexOf(l) === -1; }).join("\n") === satirlar(yatay).join("\n"));
ok("idempotent: ikinci çağrı bir şey eklemez", F.ekle(fy, { width: 1920, height: 1080 }) === fy && F.filigranliMi(fy) && !F.filigranliMi(yatay));
ok("ilk stilin fontunu yeniden kullanır (fontsdir'de zaten var)", /^Style: SufloFiligran,Archivo Black,/.test(stilSatiri(fy)), stilSatiri(fy));
ok("boyut: kısa kenarın ~%2,6'sı, beyaz, kontur 1, sağ üst hizalama", /^Style: SufloFiligran,Archivo Black,28,&H00FFFFFF,/.test(stilSatiri(fy)) && stilSatiri(fy).split(",")[16] === "1" && stilSatiri(fy).split(",")[18] === "9", stilSatiri(fy));
ok("olay: katman 9, \\an9 ve &H66& saydamlık, suflo.app", /^Dialogue: 9,0:00:00\.00,/.test(olaySatiri(fy)) && /\{\\an9\\pos\(\d+,\d+\)\\alpha&H66&\}suflo\.app$/.test(olaySatiri(fy)), olaySatiri(fy));
ok("bitiş son olayı kapsar (son bitiş + 1 sn)", /,0:01:02\.75,SufloFiligran,/.test(olaySatiri(fy)), olaySatiri(fy));
var py = posY(fy), pd = posY(fd);
ok("yatayda sağ üst: x = %97, y = %4", py[0] === 1862 && py[1] === 43, py);
ok("dikeyde (1080x1920) daha aşağıda: y = %10 (Reels/Shorts arayüzünün altı)", pd[0] === 1048 && pd[1] === 192 && pd[1] / 1920 > py[1] / 1080, pd);
ok("[Events] yoksa girdi aynen döner", F.ekle("[Script Info]\nPlayResX: 10\n", {}) === "[Script Info]\nPlayResX: 10\n" && F.ekle("", {}) === "" && F.ekle(null) === null);

// kanca başlığı: Anton fontu, kısa süre
var kanca = HT.build({ text: "Bunu *bilmeden* başlama", stil: "kutu", width: 1080, height: 1920, dur: 3, konum: "ust", vurguRenk: "#ffe600", lang: "tr" }).ass;
var fk = F.ekle(kanca, { width: 1080, height: 1920 });
ok("kanca başlığı: Anton yeniden kullanılır, 3 sn başlık + 1 sn", /^Style: SufloFiligran,Anton,/.test(stilSatiri(fk)) && /,0:00:04\.00,SufloFiligran,/.test(olaySatiri(fk)), olaySatiri(fk));

// CRLF, farklı Format sırası, stil bölümü olmayan ASS
var crlf = "[Script Info]\r\nPlayResX: 640\r\nPlayResY: 360\r\n\r\n[V4+ Styles]\r\nFormat: Fontname, Name, Fontsize\r\nStyle: Bebas Neue,Ana,40\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.00,0:00:02.50,Ana,,0,0,0,,Merhaba, dünya\r\n";
var fc = F.ekle(crlf, {});
ok("CRLF korunur, Format sırası okunur (font ilk alanda, en küçük boy 10)", fc.indexOf("\n") === fc.indexOf("\r\n") + 1 && !/[^\r]\n/.test(fc) &&
  /^Style: Bebas Neue,SufloFiligran,10$/m.test(fc.replace(/\r/g, "")) && /,0:00:03\.50,SufloFiligran,/.test(fc), JSON.stringify(eklenen(crlf, fc)));
ok("virgüllü metin bitiş zamanını bozmaz; PlayRes boyutu kullanılır (640x360 → x 621, y 14)", /\\pos\(621,14\)/.test(fc), olaySatiri(fc));
var stilsiz = "[Script Info]\nPlayResX: 1920\nPlayResY: 1080\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,x\n";
var fs2 = F.ekle(stilsiz, {});
ok("stil bölümü yoksa [Events]'ten önce açılır, font Arial", /\[V4\+ Styles\]\nFormat: Name, Fontname[^\n]*\nStyle: SufloFiligran,Arial,28,[^\n]*\n\n\[Events\]/.test(fs2) && satirlar(fs2).filter(function (l) { return /SufloFiligran/.test(l); }).length === 2, JSON.stringify(fs2));

/* ---------------- gerçek render (libass'li ffmpeg varsa) ---------------- */
function libassVar() {
  var r = cp.spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
  return !r.error && r.status === 0 && /\ssubtitles\s/.test(String(r.stdout || ""));
}
if (!libassVar()) {
  console.log("ATLA render: libass'li ffmpeg yok");
} else {
  var OR = require(path.join(__dirname, "..", "js", "overlay-render.js"));
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-filigran-"));
  fs.copyFileSync(path.join(__dirname, "..", "fonts", "ArchivoBlack.ttf"), path.join(tmp, "ArchivoBlack.ttf"));
  // sağ üst köşe alfası (rgba ham kare, t = 0.5 sn)
  function kose(ass, ad) {
    fs.writeFileSync(path.join(tmp, ad), ass, "utf8");
    var src = OR.kaynak({ g: 1080, y: 1920, fps: 10, sure: 1, assAd: ad, fontsdir: ":fontsdir=." });
    var raw = cp.execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", src, "-ss", "0.5", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { cwd: tmp, maxBuffer: 1 << 27 });
    var ust = 0, alt = 0;
    for (var yy = 0; yy < 1920; yy++) {
      for (var xx = 0; xx < 1080; xx++) {
        var a = raw[(yy * 1080 + xx) * 4 + 3];
        if (xx > 1080 * 0.6 && yy < 1920 * 0.2) ust += a; else alt += a;
      }
    }
    return { ust: ust, alt: alt };
  }
  var temiz = kose(dikey, "temiz.ass"), filigranli = kose(fd, "filigranli.ass");
  ok("render: filigransız katmanda sağ üst tamamen saydam", temiz.ust === 0, JSON.stringify(temiz));
  ok("render: filigranlı katmanda sağ üstte yarı saydam yazı var", filigranli.ust > 0, JSON.stringify(filigranli));
  ok("render: altyazının kendisi değişmez (sağ üst dışı alfa aynı)", temiz.alt > 0 && temiz.alt === filigranli.alt, temiz.alt + " / " + filigranli.alt);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
