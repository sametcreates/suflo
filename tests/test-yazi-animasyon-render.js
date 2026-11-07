// Suflo testi: animasyon motoru v2 — yazı animasyonlarının GERÇEK çizimi (ffmpeg / libass; tools/test.js libassGerekli).
// Her animasyon için saydam zeminde kare alınır (tests/test-animasyon.js, test-kalite-libass.js düzeni):
//  - hareket sürerken iki farklı anın kareleri FARKLI (animasyon gerçekten çiziliyor)
//  - hareket bittikten sonraki kare, aynı andaki klasik durağan Altyazı Efektleri karesiyle (giriş yok, vurgu yok)
//    piksel piksel aynı ya da farkı ≤ %0,5 (son kare yerinde; 16:9 ve 9:16 + "Platform arayüzünden kaçın")
//  - yazı kadrajın içinde (alfa kutusu kenarlara değmez)
// Parti 5: son kare kipleri (renk: yalnız alfa aynı; süs: süs katmanı çıkarılınca metin alfası aynı, süs de çizilmiş;
// kendi: büyüyen vurgu durağan iri kelimesiyle, hareket bitince kare değişmez), vurgu kutusu yalnız etkin kelimenin
// arkasında (iki kelime × iki an, alfa sütun aralıkları), karaoke dolgusu tekdüze ilerler (kelimenin %25 / %50 / %75'inde
// vurgu renkli piksel sayısı artar), kutu ve çizgi 9:16 + "Platform arayüzünden kaçın"da kadraj içinde
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
var KOK = path.join(__dirname, "..");
var SE = require(path.join(KOK, "js", "style-engine.js"));
var AE = require(path.join(KOK, "js", "altyazi-efekt.js"));
var YA = require(path.join(KOK, "js", "yazi-animasyonlari.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var ff = cp.spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
if (ff.error || ff.status !== 0 || !/\ssubtitles\s/.test(String(ff.stdout || ""))) {
  console.log("(ffmpeg / libass yok: gerçek çizim atlandı)");
  console.log("\n0/0 gecti");
  process.exit(0);
}

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-yazi-anim-"));
// Üç kelime, her biri 0,8 sn (kart 0,2 - 2,6 sn); vurgu açık (etkin kelime vurgu renginde)
var CUES = ["Bunu", "gören", "herkes"].map(function (w, i) { return { start: 0.2 + i * 0.8, end: 1.0 + i * 0.8, text: w }; });
var SON = 2.55;
var KADRAJ = [{ ad: "16:9", w: 960, h: 540, guvenli: false }, { ad: "9:16 güvenli", w: 540, h: 960, guvenli: true }];
// Hareketin sürdüğü iki an (sn): kart / ilk kelime 0,2'de başlar
var ANLAR = { "daktilo": [0.24, 0.42], "buyuyen-vurgu": [1.84, 1.92], "nefes": [0.3, 0.75] };
var SON_KIP = { "karaoke-birikimli": "renk", "iki-ton": "renk", "vurgu-kutusu": "sus", "vurgu-cizgi": "sus", "parlama": "sus", "buyuyen-vurgu": "kendi" };
// Süs katmanı (gölge / kutu yokken 0) olaylarını çıkar
function sussuz(r) { return Object.assign({}, r, { ass: r.ass.split("\n").filter(function (l) { return !/^Dialogue: 0,/.test(l); }).join("\n") }); }
// Yalnız alfa kanalı farkı (renk tasarımın parçasıyken)
function alfaFark(a, b) {
  if (a.length !== b.length || !a.length) return { oran: 1, n: 0, gorunur: 0 };
  var n = 0, gorunur = 0;
  for (var i = 3; i < a.length; i += 4) { if (a[i] > 8 || b[i] > 8) gorunur++; if (Math.abs(a[i] - b[i]) > 8) n++; }
  return { oran: n / (a.length / 4), n: n, gorunur: gorunur };
}

function derle(ov, k) {
  return SE.compile({ styleId: "efekt", cues: CUES, cueKind: "words", width: k.w, height: k.h, overrides: Object.assign({ guvenli: k.guvenli }, ov) });
}
function kare(r, t, k) {
  (r.fontFiles || []).filter(Boolean).forEach(function (f) { fs.copyFileSync(path.join(KOK, "fonts", f), path.join(tmp, f)); });
  fs.writeFileSync(path.join(tmp, "a.ass"), r.ass, "utf8");
  var p = cp.spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i",
    "color=c=black@0:s=" + k.w + "x" + k.h + ":r=100:d=2.7,format=rgba,subtitles=f=a.ass:alpha=1:fontsdir=.",
    "-ss", String(t), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { cwd: tmp, maxBuffer: 64 * 1024 * 1024 });
  return p.stdout || Buffer.alloc(0);
}
// Farklı piksel oranı (renk ya da alfa farkı > 8) ve görünür piksel sayısı
function fark(a, b) {
  if (a.length !== b.length || !a.length) return { oran: 1, n: 0 };
  var n = 0, gorunur = 0;
  for (var i = 0; i < a.length; i += 4) {
    if (a[i + 3] > 8 || b[i + 3] > 8) gorunur++;
    if (Math.abs(a[i] - b[i]) > 8 || Math.abs(a[i + 1] - b[i + 1]) > 8 || Math.abs(a[i + 2] - b[i + 2]) > 8 || Math.abs(a[i + 3] - b[i + 3]) > 8) n++;
  }
  return { oran: n / (a.length / 4), n: n, gorunur: gorunur };
}
function kutu(b, k) {
  var o = { sol: k.w, sag: -1, ust: k.h, alt: -1 };
  for (var y = 0; y < k.h; y++) for (var x = 0; x < k.w; x++) {
    if (b[(y * k.w + x) * 4 + 3] > 16) { if (x < o.sol) o.sol = x; if (x > o.sag) o.sag = x; if (y < o.ust) o.ust = y; if (y > o.alt) o.alt = y; }
  }
  return o;
}
function icinde(o, k) { return o.sag > 0 && o.sol > 0 && o.sag < k.w - 1 && o.ust > 0 && o.alt < k.h - 1; }

try {
  var taban = AE.overrides(AE.gorunum("temiz").ayar);
  YA.kimlikler().forEach(function (id) {
    KADRAJ.forEach(function (k, ki) {
      var r = derle(Object.assign({}, taban, { anim: id }), k);
      var duragan = derle(Object.assign({}, taban, { giris: "yok", aktif: "yok" }), k);
      if (ki === 0) {
        var an = ANLAR[id] || [0.24, 0.31];
        var a1 = kare(r, an[0], k), a2 = kare(r, an[1], k), d1 = fark(a1, a2);
        ok(id + ": hareket sürerken iki an farklı (" + an.join(" / ") + " sn)", d1.n > 30 && (d1.gorunur > 0), d1.n + " piksel");
        ok(id + ": hareket sürerken yazı kadrajın içinde", icinde(kutu(a2, k), k), JSON.stringify(kutu(a2, k)));
      }
      var son = kare(r, SON, k), sabit = kare(duragan, SON, k), kip = SON_KIP[id] || "ayni", d2;
      if (kip === "ayni") d2 = fark(son, sabit);
      else if (kip === "renk") d2 = alfaFark(son, sabit);
      else if (kip === "sus") {
        d2 = alfaFark(kare(sussuz(r), SON, k), sabit);
        var susFark = fark(son, sabit);
        ok(id + " [" + k.ad + "]: süs (kutu / çizgi / ışıltı) son karede çizili", susFark.n > 30, susFark.n + " piksel");
      } else d2 = fark(son, kare(r, SON - 0.4, k));
      ok(id + " [" + k.ad + "]: hareket bitince kare klasik durağan kareyle aynı (fark ≤ %0,5; kip " + kip + ")", sabit.length > 0 && d2.gorunur > 200 && d2.oran <= 0.005,
        (d2.oran * 100).toFixed(3) + "% · " + d2.n + " piksel / görünür " + d2.gorunur);
      ok(id + " [" + k.ad + "]: son karede yazı kadrajın içinde", icinde(kutu(son, k), k), JSON.stringify(kutu(son, k)));
    });
  });
  // Gölge + kutu ile de (yandan kay: kutu kartla kayar; netleş: gölgenin bulanıklığı) son kare aynı
  var k0 = KADRAJ[0];
  [["yandan-kay", { kutu: true, kutuOpak: 60 }], ["netles", { golge: { renk: "#000000", opak: 80, mesafe: 6, yumusak: 8 } }],
    ["kelime-pop", { golge: { renk: "#000000", opak: 80, mesafe: 6, yumusak: 0 }, kutu: true }]].forEach(function (x) {
    var ov = Object.assign({}, taban, x[1]);
    var d3 = fark(kare(derle(Object.assign({}, ov, { anim: x[0] }), k0), SON, k0), kare(derle(Object.assign({}, ov, { giris: "yok", aktif: "yok" }), k0), SON, k0));
    ok(x[0] + " + " + Object.keys(x[1]).join(" + ") + ": son kare klasik durağanla aynı", d3.gorunur > 200 && d3.oran <= 0.005, (d3.oran * 100).toFixed(3) + "%");
  });
  // Ölçek darbesi kelimeyi yerinde büyütür: tepe anında alfa kutusunun ortası durağan karenin ortasından az kayar
  var odR = derle(Object.assign({}, taban, { anim: "olcek-darbe" }), k0), odS = derle(Object.assign({}, taban, { giris: "yok", aktif: "yok" }), k0);
  var tepe = kutu(kare(odR, 0.28, k0), k0), sabitK = kutu(kare(odS, 0.28, k0), k0);
  var kayma = Math.abs((tepe.sol + tepe.sag) / 2 - (sabitK.sol + sabitK.sag) / 2);
  ok("olcek-darbe: tepe anında yazı büyür, kart ortası yerinde (≤ 6 px)", tepe.sag - tepe.sol > sabitK.sag - sabitK.sol && kayma <= 6,
    "genişlik " + (tepe.sag - tepe.sol) + " / " + (sabitK.sag - sabitK.sol) + " · kayma " + kayma);

  /* ---------------- parti 5 ---------------- */
  // Durağan karenin kelime sütun aralıkları (alfa sütunlarında boşlukla ayrılmış koşular)
  function sutunlar(b, k) {
    var dolu = [];
    for (var x = 0; x < k.w; x++) { var v = false; for (var y = 0; y < k.h && !v; y++) if (b[(y * k.w + x) * 4 + 3] > 40) v = true; dolu.push(v); }
    var out = [], bas = -1;
    dolu.forEach(function (v, x) { if (v && bas < 0) bas = x; if (!v && bas >= 0) { out.push([bas, x - 1]); bas = -1; } });
    if (bas >= 0) out.push([bas, k.w - 1]);
    return out;
  }
  function kesisir(a, b) { return a[0] <= b[1] && b[0] <= a[1]; }
  function kapsar(a, b) { return a[0] <= b[0] && a[1] >= b[1]; }
  var vk = derle(Object.assign({}, taban, { anim: "vurgu-kutusu" }), k0);
  var yalnizKutu = Object.assign({}, vk, { ass: vk.ass.split("\n").filter(function (l) { return !/^Dialogue/.test(l) || /,SufloKutu,/.test(l); }).join("\n") });
  var kelSut = sutunlar(kare(derle(Object.assign({}, taban, { giris: "yok", aktif: "yok" }), k0), 0.6, k0), k0);
  var k1 = sutunlar(kare(yalnizKutu, 0.6, k0), k0), k2 = sutunlar(kare(yalnizKutu, 1.4, k0), k0);
  ok("vurgu-kutusu: kutu yalnız etkin kelimenin arkasında (0,6 sn: 1. kelime, 1,4 sn: 2. kelime; alfa sütun aralıkları)",
    kelSut.length === 3 && k1.length === 1 && k2.length === 1 && kapsar(k1[0], kelSut[0]) && !kesisir(k1[0], kelSut[1]) &&
    kapsar(k2[0], kelSut[1]) && !kesisir(k2[0], kelSut[0]) && !kesisir(k2[0], kelSut[2]),
    "kelimeler " + JSON.stringify(kelSut) + " · kutu " + JSON.stringify(k1) + " / " + JSON.stringify(k2));
  // Kutudaki yazı: kutunun içinde yazı rengi (siyah) pikselleri var, vurgu (sarı) yazı yok
  var vkKare = kare(vk, 1.4, k0), siyah = 0, kutuSari = 0;
  for (var y2 = 0; y2 < k0.h; y2++) for (var x2 = k2[0][0]; x2 <= k2[0][1]; x2++) {
    var q = (y2 * k0.w + x2) * 4;
    if (vkKare[q + 3] > 200 && vkKare[q] < 40 && vkKare[q + 1] < 40 && vkKare[q + 2] < 40) siyah++;
    if (vkKare[q + 3] > 200 && vkKare[q] > 230 && vkKare[q + 1] > 190 && vkKare[q + 2] < 110) kutuSari++;
  }
  ok("vurgu-kutusu: kutu sarı, üstündeki yazı kontrast renginde (siyah)", siyah > 150 && kutuSari > 300, "siyah " + siyah + " · sarı " + kutuSari);
  // Karaoke dolgu: 2. kelime (1,0 - 1,8 sn) %25 / %50 / %75'inde vurgu renkli piksel sayısı
  var kd = derle(Object.assign({}, taban, { anim: "karaoke-dolgu" }), k0);
  var dolgu = [1.2, 1.4, 1.6].map(function (t) {
    var b = kare(kd, t, k0), n = 0;
    for (var y = 0; y < k0.h; y++) for (var x = kelSut[1][0]; x <= kelSut[1][1]; x++) {
      var i = (y * k0.w + x) * 4;
      if (b[i + 3] > 200 && b[i] > 225 && b[i + 1] > 180 && b[i + 1] < 235 && b[i + 2] < 110) n++;
    }
    return n;
  });
  ok("karaoke-dolgu: dolgu tekdüze ilerler (kelimenin %25 < %50 < %75'i vurgu renginde)", dolgu[0] > 20 && dolgu[1] > dolgu[0] * 1.3 && dolgu[2] > dolgu[1] * 1.15, dolgu.join(" < "));
  // Kutu ve çizgi 9:16 + "Platform arayüzünden kaçın"da kadraj içinde, ikon sütununun solunda
  var k9 = KADRAJ[1];
  ["vurgu-kutusu", "vurgu-cizgi", "buyuyen-vurgu"].forEach(function (id) {
    var uzun = [{ start: 0.2, end: 1.0, text: "Gerçekten" }, { start: 1.0, end: 1.8, text: "harika" }, { start: 1.8, end: 2.6, text: "oldu" }];
    var r9 = SE.compile({ styleId: "efekt", cues: uzun, cueKind: "words", width: k9.w, height: k9.h, overrides: Object.assign({ guvenli: true }, taban, { anim: id }) });
    var tum = [0.6, 1.4, 2.2].map(function (t) { return kutu(kare(r9, t, k9), k9); });
    ok(id + " [9:16 güvenli]: kutu / çizgi / iri kelime kadraj içinde ve sağ ikon sütununun solunda", tum.every(function (o) { return icinde(o, k9) && o.sag < k9.w * 0.85; }), JSON.stringify(tum));
  });
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
