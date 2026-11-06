// Suflo testi: parçalı (paralel) katman render'ı GERÇEK ffmpeg / libass ile (tools/test.js libassGerekli).
// 6 sn 1280x720 Altyazı Efektleri katmanı ("Vurucu": pop giriş + zıplayan etkin kelime) + Marka Kiti logosu,
// 29,97 fps (NTSC kesirli kare hızı, katman süresi kare katı değil): tek süreçle ve 3 parçaya zorlanarak çizilir.
// İkisi rawvideo rgba'ya açılır: kare sayısı aynı (round(sure·fps)) ve her kare BAYT BAYT aynı olmalı. Parça
// sınırlarında tolerans yok: parça libass'e mutlak zamanı (setpts=PTS+bas, tam sayı kare) verdiği için aynı kareyi
// çizer; fark çıkarsa bu bir hatadır. Ayrıca: piksel biçimi (argb), ses yok, kare zamanları ardışık, ilerleme yüzdesi,
// gerçek iptal (bütün parça süreçleri ölür, geçici klasör ve yarım çıktı silinir) ve parça hatasında tek süreçe dönüş.
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
var KOK = path.join(__dirname, "..");
var OR = require(path.join(KOK, "js", "overlay-render.js"));
var SE = require(path.join(KOK, "js", "style-engine.js"));
var AE = require(path.join(KOK, "js", "altyazi-efekt.js"));
var gercekK = require(path.join(__dirname, "_gercek-k.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var lib = cp.spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
if (lib.error || lib.status !== 0 || !/\ssubtitles\s/.test(String(lib.stdout || ""))) {
  console.log("(ffmpeg / libass yok: parçalı render testi atlandı)");
  console.log("\n0/0 gecti");
  process.exit(0);
}

var W = 1280, H = 720, FPS = 254016000000 / 8475667008, SURE = 6.02;   // Premiere'in 29,97 fps'i (KS_fps)
var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-parca-ş "));
var tmp = path.join(kok, "geçici"), srt = path.join(kok, "çıktı 'tırnak'");
fs.mkdirSync(tmp); fs.mkdirSync(srt);
var KELIMELER = "Bunu gören herkes şaşırdı çünkü hiç kimse böyle bir şey beklemiyordu ama oldu işte".split(" ");
var CUES = KELIMELER.map(function (w, i) { return { start: 0.1 + i * 0.38, end: 0.46 + i * 0.38, text: w }; });
var der = SE.compile({ styleId: "efekt", cues: CUES, cueKind: "words", width: W, height: H, overrides: AE.overrides(AE.gorunum("vurucu").ayar) });
var logoYol = path.join(kok, "marka logo.png");
cp.execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xFF33007F:s=96x60,format=rgba", "-frames:v", "1", logoYol]);
var LOGO = { path: logoYol, kose: "su", oran: 0.1, guvenli: false };

function temel(ek) {
  return Object.assign({ ass: der.ass, fontFiles: der.fontFiles, g: W, y: H, fps: FPS, sure: SURE, logo: LOGO, fontDizini: path.join(KOK, "fonts") }, ek);
}
function ham(f) { return cp.execFileSync("ffmpeg", ["-v", "error", "-i", f, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 30 }); }
function probe(f) {
  return JSON.parse(cp.execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries",
    "stream=codec_type,codec_name,pix_fmt,nb_read_frames,r_frame_rate:format=duration", "-of", "json", f]).toString());
}
function zamanlar(f) {
  return cp.execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts", "-of", "csv=p=0", f])
    .toString().trim().split(/\s+/).map(Number);
}

(async function () {
  var beklenen = OR.kareSayisi(SURE, FPS);
  ok("kare sayısı round(6,02 × 29,97) = 180", beklenen === 180, beklenen);

  // 1) tek süreç (cpus 1: eşik yok sayılmaz, tek parça)
  var K1 = gercekK({ tmp: tmp, srt: srt });
  var t1 = Date.now();
  var tek = await OR.render(K1, temel({ cikti: path.join(srt, "tek.mov"), cpus: 1 }));
  var sureTek = Date.now() - t1;
  ok("tek süreç: tek parça, logolu", tek.parca === 1 && tek.logo === true && tek.kare === 180, JSON.stringify(tek));

  // 2) parçalı (3 parçaya zorla), ilerleme durumu toplanır
  var durumlar = [];
  var K2 = gercekK({ tmp: tmp, srt: srt });
  var t2 = Date.now();
  var par = await OR.render(K2, temel({ cikti: path.join(srt, "parcali.mov"), parcaZorla: 3, durum: function (m) { durumlar.push(m); } }));
  var surePar = Date.now() - t2;
  ok("parçalı: 3 parça, aynı anda 3 ffmpeg + 1 birleştirme", par.parca === 3 && K2.surecler.length === 4, par.parca + " / " + K2.surecler.length);
  console.log("  süre: tek " + sureTek + " ms · parçalı " + surePar + " ms");

  var pt = probe(tek.path), pp = probe(par.path);
  var st = pt.streams, sp = pp.streams;
  ok("iki çıktı da tek video akışı (ses yok), qtrle argb", st.length === 1 && sp.length === 1 && st[0].codec_type === "video" && sp[0].codec_type === "video" &&
    st[0].codec_name === "qtrle" && sp[0].codec_name === "qtrle" && st[0].pix_fmt === "argb" && sp[0].pix_fmt === "argb", JSON.stringify([st, sp]));
  ok("kare sayısı aynı ve round(sure·fps)", Number(st[0].nb_read_frames) === 180 && Number(sp[0].nb_read_frames) === 180, st[0].nb_read_frames + " / " + sp[0].nb_read_frames);
  ok("kare hızı aynı", st[0].r_frame_rate === sp[0].r_frame_rate && /^\d+\/\d+$/.test(st[0].r_frame_rate), st[0].r_frame_rate + " / " + sp[0].r_frame_rate);
  ok("süre aynı", Math.abs(Number(pt.format.duration) - Number(pp.format.duration)) < 0.002, pt.format.duration + " / " + pp.format.duration);
  var zt = zamanlar(tek.path), zp = zamanlar(par.path);
  var ardisik = zp.every(function (v, i) { return i === 0 || v > zp[i - 1]; });
  ok("kare zamanları birebir aynı ve ardışık (birleştirme sınırında atlama / yineleme yok)", ardisik && JSON.stringify(zt) === JSON.stringify(zp), zp.slice(55, 65).join(","));

  var ht = ham(tek.path), hp = ham(par.path), boy = W * H * 4;
  ok("rawvideo boyları aynı (180 kare)", ht.length === hp.length && ht.length === boy * 180, ht.length + " / " + hp.length);
  var farkli = [], enCok = 0;
  for (var k = 0; k < 180; k++) {
    var a = ht.subarray(k * boy, (k + 1) * boy), b = hp.subarray(k * boy, (k + 1) * boy);
    if (!a.equals(b)) {
      farkli.push(k);
      for (var i = 0; i < boy; i++) { var d = Math.abs(a[i] - b[i]); if (d > enCok) enCok = d; }
    }
  }
  ok("her kare bayt bayt aynı (parça sınırları dahil: 60. ve 120. kare)", farkli.length === 0, farkli.slice(0, 10).join(",") + " en çok fark " + enCok);
  // en dolu kare: logo (128x80) + kelime; yazının olmadığı boş kare karşılaştırması değil
  var gorunur = 0, farkliKare = {};
  for (var kk = 0; kk < 180; kk += 6) {
    var n = 0;
    for (var j = 3; j < boy; j += 4) if (ht[kk * boy + j] > 128) n++;
    if (n > gorunur) gorunur = n;
    farkliKare[ht.subarray(kk * boy, (kk + 1) * boy).toString("base64").length + ":" + n] = 1;
  }
  ok("karelerde gerçekten yazı var ve kareler değişiyor (animasyon)", gorunur > 8000 && Object.keys(farkliKare).length > 10, gorunur + " / " + Object.keys(farkliKare).length);
  var yuzdeler = durumlar.filter(function (m) { return /^Altyazı katmanı çiziliyor · %\d+/.test(m); });
  ok("parçalı ilerleme: toplam yüzde artar, '%' ve birleştirme durumu", yuzdeler.length >= 1 && durumlar.indexOf("Parçalar birleştiriliyor…") !== -1 &&
    /hazırlanıyor… \(6 sn\)/.test(durumlar[0]), durumlar.slice(0, 6).join(" | "));
  ok("geçici klasörler silindi", fs.readdirSync(tmp).length === 0, fs.readdirSync(tmp).join(","));

  // 3) gerçek iptal: parçalar çizerken iptal → hepsi ölür, yarım çıktı ve geçici klasör yok
  var K3 = gercekK({ tmp: tmp, srt: srt });
  var jeton = OR.yerelJeton(), iptalCikti = path.join(srt, "iptal.mov"), hata = null;
  var t3 = Date.now();
  var p3 = OR.render(K3, temel({ cikti: iptalCikti, parcaZorla: 3, sure: 20, iptal: jeton,
    durum: function (m) { if (/çiziliyor/.test(m)) jeton.iptal(); } }));
  setTimeout(function () { jeton.iptal(); }, 1500);   // ilerleme gelmezse de iptal
  try { await p3; } catch (e) { hata = e; }
  var kapandi = await gercekK.hepsiKapandi(K3, 3000);
  ok("iptal: e.iptal, 'İptal edildi', hızlı döner", hata && hata.iptal === true && hata.message === "İptal edildi" && Date.now() - t3 < 8000, hata && hata.message);
  ok("iptal: bütün parça ffmpeg'leri öldü (yetim süreç yok), birleştirme başlamadı", kapandi && K3.surecler.length === 3, K3.surecler.length);
  ok("iptal: yarım çıktı yok, geçici klasör silindi", !fs.existsSync(iptalCikti) && fs.readdirSync(tmp).length === 0, fs.readdirSync(tmp).join(","));

  // 4) parça hatası → nedeni günlüğe yazılır, tek süreçle yeniden çizilir (sonuç yine doğru)
  var bozuk = 0;
  var K4 = gercekK({ tmp: tmp, srt: srt, runSar: function (exe, args, opt) {
    if (/parca-1/.test(String(opt.cwd)) && !bozuk++) return Promise.resolve({ code: 1, stdout: "", stderr: "[Parsed_subtitles_3 @ 0x1] bozuk parça\n" });
    return null;
  } });
  var geri = await OR.render(K4, temel({ cikti: path.join(srt, "geri.mov"), parcaZorla: 3 }));
  ok("parça hatası: tek süreçle yeniden, günlükte neden", geri.parca === 1 && K4.loglar.some(function (l) { return /parçalı render başarısız.*parça 2: bozuk parça \(kod 1\)/.test(l); }) &&
    Number(probe(geri.path).streams[0].nb_read_frames) === 180, K4.loglar.join(" | "));
  ok("parça hatası sonrası da geçici klasör silindi", fs.readdirSync(tmp).length === 0);

  try { fs.rmSync(kok, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack)); try { fs.rmSync(kok, { recursive: true, force: true }); } catch (e2) {} process.exit(1); });
