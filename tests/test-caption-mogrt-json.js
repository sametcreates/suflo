/*
 * 3.3 adım 21 — Altyazı Efektleri › Premiere yerel: saf model (js/caption-mogrt-json.js), paketteki şablon,
 * sürüm denetimi istisnası, lisans bildirimi ve panel bağlantısı (kaynak denetimi).
 * Çalıştır: node tests/test-caption-mogrt-json.js
 */
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var ROOT = path.join(__dirname, "..");
var CMJ = require("../js/caption-mogrt-json.js");
var AE = require("../js/altyazi-efekt.js");
var SE = require("../js/style-engine.js");

var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (evidence === undefined ? "" : "   [" + String(evidence).slice(0, 300) + "]")); }
}
function oku(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function kelimeSay(t) { return String(t).split(/\s+/).filter(Boolean).length; }
function satirlarOf(parca) { return JSON.parse(parca.json)[9]; }

/* ---------------- Sözleşme ve göreli zaman ---------------- */
var cues = [
  { start: 10, end: 12.4, text: "Bu bir *önemli* deneme cümlesi" },
  { start: 12.6, end: 14.2, text: "ikinci \"satır\" burada\\ok" }
];
var ayar = AE.normalize({ giris: "pop", aktif: "titre", satir: 2, kelime: 5 });
var r = CMJ.build(cues, ayar, { cueKind: "lines", fps: 25 });
var p0 = r.parcalar[0], dizi = JSON.parse(p0.json);
var stil = AE.sablonStili(ayar, { olcek: 1 });
ok("JSON_Input 10 alanlı dizi: ilk 9 alan altyazi-efekt.js sablonStili ile 1:1",
  dizi.length === 10 && JSON.stringify(dizi.slice(0, 9)) === JSON.stringify(stil), JSON.stringify(dizi.slice(0, 9)));
ok("textAnim / hlAnim giriş ve vurgu kimliklerinin dizini (pop = 1, titre = 2)", dizi[7] === 1 && dizi[8] === 2, dizi.slice(7, 9));
ok("Satır zamanları parçanın başına göre ms (ilk satır 0'dan başlar)", p0.start === 10 && dizi[9][0][0] === 0 && dizi[9][0][1] === 2400, JSON.stringify(dizi[9][0]));
ok("İkinci kart parçanın başına göre (12,6 sn → 2600 ms)", dizi[9][1][0] === 2600 && dizi[9][1][1] === 4200, JSON.stringify(dizi[9][1]));
var hizali = dizi[9].every(function (s) { return s[3].length === 2 * kelimeSay(s[2]); });
ok("Her kartta kelime sayısı = zaman çifti sayısı (satır kırılımı dahil)", hizali, JSON.stringify(dizi[9]));
var tekdüze = dizi[9].every(function (s) {
  for (var i = 0; i < s[3].length; i++) { if (s[3][i] < s[0] || s[3][i] > s[1]) return false; if (i && s[3][i] < s[3][i - 1]) return false; }
  return true;
});
ok("Kelime zamanları kart içinde ve artan", tekdüze, JSON.stringify(dizi[9].map(function (s) { return s[3]; })));
ok("*Vurgu* işaretleri ayıklanır, sayısı vurguKaybi'nde", dizi[9][0][2].indexOf("*") === -1 && /önemli/.test(dizi[9][0][2]) && r.vurguKaybi === 1, dizi[9][0][2] + " / " + r.vurguKaybi);
ok("Tırnak ve ters bölü JSON içinde kaçırılır, geri okununca aynı", dizi[9][1][2].replace(/\n/g, " ") === "ikinci \"satır\" burada\\ok" && /\\\\ok/.test(p0.json) && /\\"satır\\"/.test(p0.json), p0.json);
ok("Kart içi satır kırılımı \\n (önizlemeyle aynı 2 satır)", /\n/.test(dizi[9][0][2]) && p0.json.indexOf("\n") === -1, JSON.stringify(dizi[9][0][2]));

// Kartlar önizlemenin kartlarıyla aynı (stil motorunun efektSatirlari)
var kartlar = SE.efektSatirlari({ cues: cues, cueKind: "lines" }, AE.overrides(ayar));
ok("Kart sayısı ve kelimeleri stil motorunun efekt kartlarıyla aynı", kartlar.length === dizi[9].length &&
  kartlar.every(function (k, i) { return k.kelimeler.map(function (w) { return w.text; }).join(" ") === dizi[9][i][2].replace(/\n/g, " "); }),
  JSON.stringify(kartlar.map(function (k) { return k.kelimeler.map(function (w) { return w.text; }); })));
var r3 = CMJ.build([{ start: 0, end: 4, text: "bir iki üç dört beş altı yedi" }], AE.normalize({ kelime: 3, satir: 1 }), { cueKind: "lines" });
ok("En çok kelime 3: her kartta ≤ 3 kelime, satır kırılımı yok (1 satır)", satirlarOf(r3.parcalar[0]).every(function (s) { return kelimeSay(s[2]) <= 3 && s[2].indexOf("\n") === -1; }),
  JSON.stringify(satirlarOf(r3.parcalar[0])));

// Kontrol karakterleri ve U+2028 (ExtendScript'in eval tabanlı KJSON.parse'ını böler)
var rK = CMJ.build([{ start: 0, end: 2, text: "satır\u2028ayırıcı ve\u0007zil" }], ayar, { cueKind: "lines" });
ok("U+2028 / kontrol karakteri JSON'da ham kalmaz, kelime sayısı korunur",
  !/[\u2028\u2029\u0007]/.test(rK.parcalar[0].json) && satirlarOf(rK.parcalar[0]).every(function (s) { return s[3].length === 2 * kelimeSay(s[2]); }),
  JSON.stringify(satirlarOf(rK.parcalar[0])));

// Üst üste binen kartlar: kart sonu sonraki kartın başını geçmez
var rO = CMJ.build([{ start: 0, end: 3, text: "birinci kart." }, { start: 2, end: 4, text: "ikinci kart." }], ayar, { cueKind: "lines" });
var so = satirlarOf(rO.parcalar[0]);
ok("Çakışan kartlar kırpılır (kart sonu ≤ sonraki kart başı)", so.length === 2 && so[0][1] <= so[1][0], JSON.stringify(so));

/* ---------------- Parçalama: 45 sn ve 8 KB ---------------- */
var uzun = [];
for (var i = 0; i < 120; i++) uzun.push({ start: i * 1.5 + 0.013, end: i * 1.5 + 1.3, text: "kelime " + i + " daha var." });
var rU = CMJ.build(uzun, ayar, { cueKind: "lines", fps: 25 });
ok("Uzun transkript birden çok parçaya bölünür", rU.parcalar.length >= 4, rU.parcalar.length);
ok("Her parça en çok 45 sn (+1 kare)", rU.parcalar.every(function (p) { return p.end - p.start <= 45 + 1 / 25 + 1e-9; }),
  JSON.stringify(rU.parcalar.map(function (p) { return [p.start, p.end]; })));
ok("Parçalar üst üste binmez (aynı izde yan yana)", rU.parcalar.every(function (p, k) { return k === 0 || p.start >= rU.parcalar[k - 1].end - 1e-9; }));
ok("Parça sınırları kareye oturur (25 fps)", rU.parcalar.every(function (p) {
  return Math.abs(p.start * 25 - Math.round(p.start * 25)) < 1e-6 && Math.abs(p.end * 25 - Math.round(p.end * 25)) < 1e-6;
}), JSON.stringify(rU.parcalar.map(function (p) { return [p.start, p.end]; })));
var toplam = rU.parcalar.reduce(function (n, p) { return n + p.satir; }, 0);
ok("Hiçbir kart kaybolmaz (parçaların kart toplamı = kart sayısı)", toplam === rU.satirSayisi && rU.satirSayisi === 120, toplam + " / " + rU.satirSayisi);
ok("İlk satır zamanı kareye oturmuş parça başına göre (negatif değil)", rU.parcalar.every(function (p) { return satirlarOf(p)[0][0] >= 0; }));

var yogun = [];
for (var j = 0; j < 60; j++) yogun.push({ start: j * 0.5, end: j * 0.5 + 0.45, text: "Çok uzun bir altyazı satırı şöyle güzel çalışıyor mu " + j });
var rB = CMJ.build(yogun, AE.normalize({ kelime: 10, satir: 3 }), { cueKind: "lines", bayt: 2000 });
ok("JSON_Input en çok 2 KB sınırında kalır (bayt: UTF-8)", rB.parcalar.length > 1 && rB.parcalar.every(function (p) { return p.bayt <= 2000 && p.bayt === Buffer.byteLength(p.json, "utf8"); }),
  JSON.stringify(rB.parcalar.map(function (p) { return p.bayt; })));
var rB8 = CMJ.build(yogun, AE.normalize({ kelime: 10, satir: 3 }), { cueKind: "lines" });
ok("Varsayılan 8 KB sınırı: daha az parça, her biri ≤ 8000 bayt", rB8.parcalar.length < rB.parcalar.length && rB8.parcalar.every(function (p) { return p.bayt <= CMJ.SINIR.bayt; }),
  rB8.parcalar.length + " / " + rB.parcalar.length);
ok("Sınırlar ve kademeler: 45 sn, 8 KB → 4 KB → 2 KB", CMJ.SINIR.sure === 45 && CMJ.SINIR.bayt === 8000 && CMJ.BAYT_KADEMELERI.join(",") === "8000,4000,2000");

// Kelime modu (k1): her kelime ayrı cue
var rW = CMJ.build([{ start: 0, end: 0.4, text: "merhaba" }, { start: 0.4, end: 0.9, text: "dünya" }], ayar, { cueKind: "words" });
ok("Kelime cue'ları tek kartta birleşir (önizlemedeki gibi)", satirlarOf(rW.parcalar[0]).length === 1 && satirlarOf(rW.parcalar[0])[0][3].length === 4,
  JSON.stringify(satirlarOf(rW.parcalar[0])));
ok("Boş transkript: parça yok", CMJ.build([], ayar, {}).parcalar.length === 0);

/* ---------------- Yerleşim: 1920×1080 kompozisyon → sekans ---------------- */
var y1 = CMJ.yerlesim(1920, 1080, { x: 0.5, y: 0.84 });
ok("1920×1080: ölçek %100, punto çarpanı 1, konum kadraj pikseli", y1.olcek === 100 && y1.punto === 1 && y1.konum[0] === 960 && y1.konum[1] === 907.2, JSON.stringify(y1));
var y2 = CMJ.yerlesim(1080, 1920, { x: 0.5, y: 0.74 });
ok("9:16: kompozisyon sekansı kaplar (%177,78), konum kompozisyon içinde", y2.olcek === 177.78 && y2.konum[1] > 0 && y2.konum[1] < 1080 && y2.konum[0] === 960, JSON.stringify(y2));
ok("9:16: punto ölçekten arındırılır (görünen punto = boyut × kısa kenar / 1080)", Math.abs(y2.punto * y2.olcek / 100 - 1) < 0.01, JSON.stringify(y2));
var y3 = CMJ.yerlesim(3840, 2160, { x: 0.25, y: 0.5 });
ok("4K: ölçek %200, punto 1, x %25 → kompozisyonda 480", y3.olcek === 200 && y3.punto === 1 && y3.konum[0] === 480 && y3.konum[1] === 540, JSON.stringify(y3));
ok("Oran kontrolü için 0-1 konum da verilir", y1.konumOran[0] === 0.5 && y1.konumOran[1] === 0.84, JSON.stringify(y1.konumOran));
var rP = CMJ.build(cues, AE.normalize({ boyut: 100 }), { cueKind: "lines", punto: y2.punto });
ok("Punto çarpanı JSON'daki puntoya uygulanır", JSON.parse(rP.parcalar[0].json)[3] === Math.round(100 * y2.punto), JSON.parse(rP.parcalar[0].json)[3]);

/* ---------------- Fontlar ---------------- */
ok("fontKuruluMu: Montserrat-Bold.ttf Montserrat'ı karşılar (büyük / küçük harf fark etmez)", CMJ.fontKuruluMu("Montserrat", ["C:\\Windows\\Fonts\\MONTSERRAT-BOLD.TTF"]));
ok("fontKuruluMu: Archivo Black ↔ ArchivoBlack.ttf", CMJ.fontKuruluMu("Archivo Black", ["ArchivoBlack.ttf"]));
ok("fontKuruluMu: başka font ya da lisans metni karşılamaz", !CMJ.fontKuruluMu("Anton", ["arial.ttf", "Anton.txt"]));
var fKurulu = CMJ.fontSecimi(AE.normalize({ font: "Montserrat", kalin: true }), ["Montserrat-Bold.ttf"]);
ok("Kurulu bilinen aile: PostScript adı (Montserrat-Bold)", fKurulu.ps === "Montserrat-Bold" && !fKurulu.yedek, JSON.stringify(fKurulu));
var fYok = CMJ.fontSecimi(AE.normalize({ font: "Anton", kalin: true }), ["arial.ttf"]);
ok("Kurulu olmayan aile: Arial (kalın korunur) + 'kurulu-degil' uyarısı", fYok.ps === "Arial-BoldMT" && fYok.yedek && fYok.neden === "kurulu-degil", JSON.stringify(fYok));
var fDenetimsiz = CMJ.fontSecimi(AE.normalize({ font: "Lora", kalin: false }), null);
ok("Dosya listesi yoksa (Node yok) eşlemedeki ad gider", fDenetimsiz.ps === "Lora-Regular" && !fDenetimsiz.yedek, JSON.stringify(fDenetimsiz));
// Adım 18'in yeni bir ailesi (PostScript eşlemesinde yok): Arial'a düşer, uyarı "bilinmiyor"
var eskiN = AE.normalize, eskiS = AE.sablonFontu;
AE.normalize = function () { return { font: "Inter", kalin: false, italik: true }; };
AE.sablonFontu = function (n) { return n.font; };
var fBilinmez;
try { fBilinmez = CMJ.fontSecimi({ font: "Inter" }, ["Inter-Regular.ttf"]); } finally { AE.normalize = eskiN; AE.sablonFontu = eskiS; }
ok("Eşlemede olmayan aile (adım 18 fontu): Arial İtalik + 'bilinmiyor'", fBilinmez.ps === "Arial-ItalicMT" && fBilinmez.neden === "bilinmiyor", JSON.stringify(fBilinmez));
var rF = CMJ.build(cues, ayar, { cueKind: "lines", font: "ArialMT" });
ok("Seçilen font JSON'un 3. alanına yazılır", JSON.parse(rF.parcalar[0].json)[2] === "ArialMT");

var plW = CMJ.fontKurulumPlani("win32", { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" }, [
  { dosya: "Anton.ttf", kaynak: "C:\\ext\\fonts\\Anton.ttf" }, { dosya: "Anton.ttf", kaynak: "x" }, { dosya: "OFL-Anton.txt", kaynak: "y" }]);
ok("Windows planı: kullanıcı font klasörü, tekrarsız, yalnız ttf/otf", plW.length === 1 && plW[0].hedef === "C:\\Users\\a\\AppData\\Local\\Microsoft\\Windows\\Fonts\\Anton.ttf", JSON.stringify(plW));
ok("Windows planı: HKCU Fonts değeri reg args DİZİSİ (kabuk dizgesi değil)", Array.isArray(plW[0].reg) &&
  plW[0].reg.join("|") === "add|HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts|/v|Anton (TrueType)|/t|REG_SZ|/d|C:\\Users\\a\\AppData\\Local\\Microsoft\\Windows\\Fonts\\Anton.ttf|/f",
  JSON.stringify(plW[0].reg));
var plM = CMJ.fontKurulumPlani("darwin", { HOME: "/Users/a" }, [{ dosya: "Lora.ttf", kaynak: "/ext/fonts/Lora.ttf" }]);
ok("macOS planı: ~/Library/Fonts, reg yok", plM.length === 1 && plM[0].hedef === "/Users/a/Library/Fonts/Lora.ttf" && plM[0].reg === null, JSON.stringify(plM));
ok("Linux / klasör bilinmiyor: boş plan", CMJ.fontKurulumPlani("linux", { HOME: "/home/a" }, [{ dosya: "Lora.ttf", kaynak: "x" }]).length === 0 &&
  CMJ.fontKurulumPlani("win32", {}, [{ dosya: "Lora.ttf", kaynak: "x" }]).length === 0);
var paket = CMJ.paketFontlari(["Anton.ttf", "Montserrat.ttf", "Montserrat-Bold.ttf", "Montserrat-Regular.ttf", "OFL-Anton.txt", "Lora.ttf"]);
ok("Paket fontları: statik yüzler varsa değişken ana dosya kurulmaz, lisanslar hariç", paket.join(",") === "Anton.ttf,Montserrat-Bold.ttf,Montserrat-Regular.ttf,Lora.ttf", paket.join(","));
ok("Font klasörleri: Windows sistem + kullanıcı, macOS kullanıcı önce",
  CMJ.fontKlasorleri("win32", { WINDIR: "C:\\Windows", LOCALAPPDATA: "C:\\L" }).join("|") === "C:\\Windows\\Fonts|C:\\L\\Microsoft\\Windows\\Fonts" &&
  CMJ.fontKlasorleri("darwin", { HOME: "/Users/a" })[0] === "/Users/a/Library/Fonts");

/* ---------------- Destek denetimi ---------------- */
ok("Premiere 21 desteklenmez (surum)", CMJ.yerelDestek("21.2.0", { seq: true, importMGT: true }).neden === "surum");
ok("Premiere 22+ ve importMGT: destekli", CMJ.yerelDestek("22.0.0", { seq: true, importMGT: true }).ok && CMJ.yerelDestek("26.0", null).ok);
ok("importMGT yoksa 'api', sekans yoksa 'sekans'", CMJ.yerelDestek("25.1", { seq: true, importMGT: false }).neden === "api" && CMJ.yerelDestek("25.1", { seq: false }).neden === "sekans");
ok("Sürüm bilinmiyorsa destekli sayılmaz", !CMJ.yerelDestek("", null).ok);

/* ---------------- Paketteki şablon ---------------- */
var sablonYol = path.join(ROOT, CMJ.SABLON.yol);
var sablonVar = fs.existsSync(sablonYol);
var sha = sablonVar ? crypto.createHash("sha256").update(fs.readFileSync(sablonYol)).digest("hex") : "";
ok("Şablon Suflo yolunda ve sha256'sı TranscriptAI'ın dist/source/dinamik_altyazi_motoru.mogrt'u ile aynı",
  sablonVar && sha === CMJ.SABLON.sha256 && sha === "32c2394de3f639fede180bc274e30166daa0375298af5c5f7ae3dfbf73989969", sha);
var ham = sablonVar ? fs.readFileSync(sablonYol) : Buffer.alloc(0);
ok("Şablon bir MOGRT (zip: definition.json + project.aegraphic)", ham.slice(0, 2).toString() === "PK" && ham.indexOf("definition.json") !== -1 && ham.indexOf("project.aegraphic") !== -1);
ok("Şablon küçük (≈15 KB, font / video gömülü değil)", ham.length > 8000 && ham.length < 32000, ham.length);

var vr = oku("tools/verify-release.ps1");
ok("verify-release: .mogrt istisnası dar (yol + sha256) ve dosya zorunlu",
  vr.indexOf("$sufloSablon = '(^|/)assets/mogrt/altyazi-efekt-v1\\.mogrt$'") !== -1 &&
  vr.indexOf("$sufloSablonSha = '" + CMJ.SABLON.sha256 + "'") !== -1 &&
  /-notmatch \$sufloSablon \}\) \+ \$sablonBozuk/.test(vr) && /Test-SufloSablon \$_/.test(vr) &&
  /'\(\^\|\/\)assets\/mogrt\/altyazi-efekt-v1\\\.mogrt\$'/.test(vr) && /'\(\^\|\/\)js\/caption-mogrt-json\\\.js\$'/.test(vr));
ok("verify-release: başka her .mogrt hâlâ ücretli içerik sayılır", /'\\\.\(mogrt\|prfpset/.test(vr));
ok("Paketleme: assets/ ve js/ klasörleri ZXP'ye ve kurucuya girer",
  /\$stageItems = @\([^)]*"assets"[^)]*"js"|\$stageItems = @\([^)]*"js"[^)]*"assets"/.test(oku("tools/package.ps1")) &&
  /\$panelItems = @\([^)]*"js"[^)]*"assets"/.test(oku("tools/kurucu-yap.ps1")));
ok(".gitattributes: .mogrt ikili (Windows autocrlf sha256'yı bozmasın)", /^\*\.mogrt binary$/m.test(oku(".gitattributes")));

var notices = oku("THIRD_PARTY_NOTICES.md");
ok("THIRD_PARTY_NOTICES: TranscriptAI (MIT, Aktuğ Antika, f1881ea), izinle kullanılan şablon ve uyarlanan dosyalar",
  /TranscriptAI/.test(notices) && /Copyright \(c\) 2026 Aktuğ Antika/.test(notices) && /f1881ea/.test(notices) &&
  /altyazi-efekt-v1\.mogrt/.test(notices) && /author's permission/.test(notices) && /jsx\/host\.jsx/.test(notices));

/* ---------------- Panel bağlantısı (kaynak denetimi) ---------------- */
var html = oku("index.html");
var iAE = html.indexOf('<script src="js/altyazi-efekt.js">'), iCMJ = html.indexOf('<script src="js/caption-mogrt-json.js">'), iCap = html.indexOf('<script src="js/captions.js">');
ok("index.html: caption-mogrt-json.js altyazi-efekt.js'ten sonra, captions.js'ten önce", iAE !== -1 && iCMJ > iAE && iCap > iCMJ, [iAE, iCMJ, iCap].join(","));
ok("index.html: çıktı seçimi (Premiere yerel / Video katmanı), font notu ve kaldır düğmesi",
  /id="cap-efekt-cikti"/.test(html) && /<option value="yerel" selected>Premiere yerel \(render yok\)<\/option>/.test(html) &&
  /<option value="katman">Video katmanı<\/option>/.test(html) && /id="cap-yerel-font-kur"[^>]*>Suflo fontlarını kur</.test(html) && /id="cap-yerel-kaldir"/.test(html));
var cap = oku("js/captions.js");
var ov = cap.slice(cap.indexOf("async function overlayUygula()"), cap.indexOf("function buildAssKaydirilmis("));
ok("Yerel çıktı Pro.gate('overlay') kapısından SONRA ve yalnız Pro'da (deneme filigranlı katmana gider)",
  ov.indexOf('Pro.gate("overlay"') !== -1 && ov.indexOf("yerelAltyaziUygula()") > ov.indexOf('Pro.gate("overlay"') &&
  /if \(yerelCiktiSecili\(\) && \(typeof Pro === "undefined" \|\| Pro\.isPro\(\)\)\) \{\s*if \(await yerelAltyaziUygula\(\)\) return;/.test(ov));
var bagla = cap.slice(cap.indexOf("function yerelCiktiBagla()"), cap.indexOf("function efektKontrolleriniBagla()"));
ok("Panel açılışında Premiere çağrısı yok (çıktı seçimi yalnız yerel depo)", bagla.length > 50 && bagla.indexOf("K.call") === -1 && bagla.indexOf("evalScript") === -1);
var kur = cap.slice(cap.indexOf("async function yerelFontlariKur()"), cap.indexOf("function yerelKayitOku()"));
ok("Font kurulumu: reg yalnız args dizisiyle (K.run), kabuk dizgesi yok", /K\.run\("reg", adim\.reg\)/.test(kur) && !/exec\(|execSync|shell:/.test(kur));
var uyg = cap.slice(cap.indexOf("async function yerelAltyaziUygula()"), cap.indexOf("/*\n   * Premiere'in caption izi"));
ok("Yerleştirme hatasında grup kaldırılır; şablon açılamazsa video katmanına düşülür",
  /KS_removeCaptionMogrtBatch/.test(uyg) && /\["ice-aktarma", "bilesen", "sozlesme", "dogrulama"\]/.test(uyg) && /return false;/.test(uyg));
ok("Doğrulama tutmazsa parça boyu küçültülüp yeniden denenir", /hata\.kod === "dogrulama" && ki \+ 1 < kademeler\.length\) continue/.test(uyg));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
