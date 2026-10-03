// Suflo testi: "İlk altyazın 2 dakikada" rehberi — saf kurallar (js/onboarding-steps.js),
// Premiere'e tıklamadan dokunmama kuralı (js/onboarding.js) ve örnek transkriptin go() ile aynı satırları vermesi
var fs = require("fs"), path = require("path"), vm = require("vm"), os = require("os");
var SO = require(path.join(__dirname, "..", "js", "onboarding-steps.js"));
var CT = require(path.join(__dirname, "..", "js", "caption-text.js"));
var ayikla = require("./_ayikla.js");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : "")); }
function J(x) { return JSON.stringify(x); }

/* ================= 1) gosterimKarari: doğruluk tablosu ================= */
var K1 = SO.gosterimKarari;
ok("taze kurulum (settings.json yoktu) → tam", K1({ ayarDosyasiVardi: false }) === "tam");
ok("taze kurulum, modeli olsa bile → tam", K1({ ayarDosyasiVardi: false, modelVar: true, apiKey: "gsk_x" }) === "tam");
ok("3.0'dan yükselten, yenilikleri görmüş, model + anahtar → yok",
  K1({ ayarDosyasiVardi: true, yeniliklerGoruldu: "3.0", modelVar: true, apiKey: "gsk_x" }) === "yok");
ok("3.0'dan yükselten, yenilikleri görmüş, modeli var anahtarı yok → cip",
  K1({ ayarDosyasiVardi: true, yeniliklerGoruldu: "3.0", modelVar: true, apiKey: "" }) === "cip");
ok("yükselten, yalnız anahtar (bulut) → yok", K1({ ayarDosyasiVardi: true, yeniliklerGoruldu: "3.0", apiKey: "gsk_x" }) === "yok");
ok("takılı kullanıcı (model yok, anahtar yok, uygulama yok) → tam",
  K1({ ayarDosyasiVardi: true, yeniliklerGoruldu: "3.0", modelVar: false, apiKey: "", uygulandi: false }) === "tam");
ok("motoru silmiş ama daha önce altyazı uygulamış → cip (takılı sayılmaz)",
  K1({ ayarDosyasiVardi: true, modelVar: false, apiKey: "", uygulandi: true }) === "cip");
ok("rehberi kapatmış → yok (taze olsa bile)", K1({ ayarDosyasiVardi: false, onboarding: { kapandi: true } }) === "yok" &&
  K1({ ayarDosyasiVardi: true, onboarding: { kapandi: true } }) === "yok");
ok("rehberi bitirmiş → yok", K1({ ayarDosyasiVardi: true, onboarding: { bitti: true }, modelVar: false, apiKey: "" }) === "yok");
ok("girdi yoksa taze kurulum sayılır", K1() === "tam");

/* ================= 2) Adım hesaplayıcı ================= */
var H = SO.adimlariHesapla;
var h0 = H(null, { ornekVar: true });
ok("sıra motor → ornek → stil → ai; ilk adım motor", J(SO.ADIMLAR) === J(["motor", "ornek", "stil", "ai"]) && h0.siradaki === "motor" && h0.tamamlanan === 0 && h0.toplam === 4);
var h1 = H(null, { modelVar: true, ornekVar: true });
ok("model kurulunca motor tamam, sıradaki örnek", h1.adimlar.motor === "tamam" && h1.siradaki === "ornek" && h1.ornekModu === "ornek");
var hYok = H(null, { modelVar: true, ornekVar: false });
ok("örnek manifest yoksa ornek 'yok' (kendi klibinle ilk altyazı) ve sıradaki o",
  hYok.adimlar.ornek === "yok" && hYok.siradaki === "ornek" && hYok.ornekModu === "kendi", J(hYok));
var hIlk = H(null, { modelVar: true, ornekVar: false, ilkAltyazi: true });
ok("manifest yokken ilk başarılı altyazı adımı tamamlar", hIlk.adimlar.ornek === "tamam" && hIlk.siradaki === "stil");
var hBulut = H(null, { modelVar: false, apiKey: true, provider: "groq", ornekVar: true });
ok("yalnız Groq anahtarı motor sayılır (bulut rotası) ve AI adımını da tamamlar",
  hBulut.adimlar.motor === "tamam" && hBulut.adimlar.ai === "tamam" && hBulut.siradaki === "ornek", J(hBulut.adimlar));
var hYerelAnahtar = H(null, { modelVar: false, apiKey: true, provider: "local" });
ok("anahtar var ama sağlayıcı 'yalnız yerel' → motor hazır değil", hYerelAnahtar.adimlar.motor === "bekliyor" && hYerelAnahtar.adimlar.ai === "tamam");
var kay = SO.yeniKayit();
kay.adimlar.ornek = "tamam"; kay.adimlar.stil = "atlandi";
var h2 = H(kay, { modelVar: true, ornekVar: true });
ok("kayıtlı tamam/atlandı korunur, sıradaki ai", h2.adimlar.ornek === "tamam" && h2.adimlar.stil === "atlandi" && h2.siradaki === "ai" && h2.tamamlanan === 3);
ok("ilerleme metni 'Kurulum 3/4'", SO.ilerlemeMetni(h2) === "Kurulum 3/4");
var h3 = H(kay, { modelVar: true, ornekVar: true, apiKey: true, provider: "local" });
ok("hepsi bitince bitti, sıradaki yok", h3.bitti === true && h3.siradaki === null && h3.tamamlanan === 4);
var atla = SO.yeniKayit(); atla.adimlar.motor = "atlandi";
ok("motor atlandıysa sıradaki örnek", H(atla, { ornekVar: true }).siradaki === "ornek" && H(atla, {}).adimlar.motor === "atlandi");
ok("motor atlandı ama sonradan kuruldu → tamam", H(atla, { modelVar: true }).adimlar.motor === "tamam");
var bozuk = SO.kayitDuzelt({ surum: 9, adimlar: { motor: "uydurma", ai: "atlandi" }, kapandi: "evet" });
ok("bozuk kayıt düzeltilir", bozuk.adimlar.motor === "bekliyor" && bozuk.adimlar.ai === "atlandi" && bozuk.kapandi === false && bozuk.surum === 1, J(bozuk));

/* ================= 3) modelSec ================= */
ok("tr → small (190 MB)", J(SO.modelSec({ lang: "tr", ramGB: 16 })) === J({ bulut: false, model: "small", sizeMB: 190, gpuOner: false }));
ok("az → small", SO.modelSec({ lang: "az", ramGB: 8 }).model === "small");
ok("en → base", SO.modelSec({ lang: "en", ramGB: 16 }).model === "base" && SO.modelSec({ lang: "en" }).sizeMB === 60);
ok("dil boş (Otomatik) → small", SO.modelSec({ lang: "" }).model === "small");
ok("Mac + Homebrew yok → bulut", J(SO.modelSec({ lang: "tr", mac: true, brew: false })) === J({ bulut: true, neden: "brew-yok" }));
ok("Mac + Homebrew var → small", SO.modelSec({ lang: "tr", mac: true, brew: true }).model === "small");
ok("Mac, Homebrew yok ama motor zaten kurulu → yerel model", SO.modelSec({ lang: "tr", mac: true, brew: false, motorVar: true }).model === "small");
ok("NVIDIA'da ilk kurulum yine küçük model (cuBLAS sonra, isteğe bağlı)", SO.modelSec({ lang: "tr", gpu: "cuda", ramGB: 32 }).model === "small" && SO.modelSec({ gpu: "cuda" }).gpuOner === true);
ok("çok düşük RAM → base", SO.modelSec({ lang: "tr", ramGB: 3 }).model === "base");
ok("modelGecisi: ayar hâlâ rehber modeli → turbo; kullanıcı değiştirdiyse dokunma",
  SO.modelGecisi("small", "small", "turbo") === "turbo" && SO.modelGecisi("base", "small", "turbo") === null && SO.modelGecisi("large", "small", "turbo") === null);

/* ================= 4) Anahtar ayıklama + doğrulama sonucu ================= */
var KEY = "gsk_" + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijklmnop";
var A = SO.anahtarAyikla;
ok("düz anahtar", A(KEY) === KEY);
ok("boşluk ve tırnak temizlenir", A("   \"" + KEY + "\"  \n") === KEY && A("'" + KEY + "'") === KEY);
ok("'Bearer ' ve açıklama satırı atılır", A("Bearer " + KEY) === KEY && A("API Key\n" + KEY + "\nCopy") === KEY);
ok("çıplak 'gsk_' reddedilir", A("gsk_") === "" && A("gsk_abc") === "");
ok("OpenAI sk- anahtarı reddedilir", A("sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789") === "");
ok("anahtarsız çok satırlı metin reddedilir", A("merhaba\ndünya\nbu bir anahtar değil") === "" && A("") === "" && A(null) === "");
ok("iki farklı anahtar reddedilir (belirsiz)", A(KEY + "\n" + KEY.replace("A", "B")) === "");
ok("aynı anahtar iki kez → tek anahtar", A(KEY + " " + KEY) === KEY);
ok("başka sözcüğün parçası olan gsk_ alınmaz", A("xgsk_" + KEY.slice(4)) === "");
var S = SO.anahtarSonucu;
ok("200 → ok", S(200).durum === "ok" && S(200).kaydet === true && S(200).gecerli === true);
ok("401/403 → geçersiz, kaydedilmez", S(401).durum === "gecersiz" && S(403).durum === "gecersiz" && S(401).kaydet === false);
ok("429 → geçerli ama limitli, kaydedilir", S(429).durum === "limit" && S(429).kaydet === true && S(429).gecerli === true);
ok("0 / 502 / 503 → bağlantı yok, ASLA geçersiz değil", ["0", 0, 502, 503, undefined].every(function (k) {
  var r = S(k); return r.durum === "baglanti-yok" && r.kaydet === true && r.gecerli === null;
}));
ok("bilinmeyen kod (404) → belirsiz ama kaydedilir", S(404).durum === "belirsiz" && S(404).kaydet === true);

/* ================= 5) Örnek manifest + WAV başlığı + hazır transkript ================= */
var M = SO.ornekManifestDogrula;
var iyi = M({ surum: 1, lang: "tr", video: "ornek-tr.mp4", wav: "ornek-tr.wav", mp3: "ornek-tr.mp3", words: "ornek-tr.words.json", sure: 15 });
ok("geçerli manifest", iyi.ok && iyi.dosyalar.video === "ornek-tr.mp4" && iyi.dosyalar.mp3 === "ornek-tr.mp3" && iyi.sekans === "Suflo Deneme" && iyi.sure === 15, J(iyi));
ok("yol/üst klasör içeren ad reddedilir", !M({ video: "../x.mp4", wav: "a.wav", words: "a.json" }).ok && !M({ video: "a/b.mp4", wav: "a.wav", words: "a.json" }).ok);
ok("yanlış uzantı reddedilir", !M({ video: "a.mov", wav: "a.wav", words: "a.json" }).ok);
ok("mp3 isteğe bağlı", M({ video: "a.mp4", wav: "a.wav", words: "a.json" }).ok && !M({ video: "a.mp4", wav: "a.wav", words: "a.json", mp3: "../a.mp3" }).ok);
function wav(rate, kanal, bit) {
  var b = Buffer.alloc(44);
  b.write("RIFF", 0); b.writeUInt32LE(36, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(kanal, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * kanal * bit / 8, 28);
  b.writeUInt16LE(kanal * bit / 8, 32); b.writeUInt16LE(bit, 34); b.write("data", 36); b.writeUInt32LE(0, 40);
  return b;
}
ok("WAV: 16 kHz mono 16-bit PCM uygun", SO.wavBaslik(wav(16000, 1, 16)).uygun === true);
ok("WAV: 48 kHz stereo uygun değil", SO.wavBaslik(wav(48000, 2, 16)).uygun === false && SO.wavBaslik(wav(48000, 2, 16)).ornekleme === 48000);
ok("WAV: RIFF değilse ok:false", SO.wavBaslik(Buffer.from("merhaba dünya bu bir wav değil ama 44 bayttan uzun ")).ok === false);

/* ================= 6) Hazır transkript → go() ile aynı satırlar ================= */
// Elle doğrulanmış örnek transkript biçimi (Turbo çıktısı): kelimeler + satırlar, klibe göreli
var ORNEK = {
  lang: "tr",
  words: [
    { start: 0.32, end: 0.61, text: "Merhaba," }, { start: 0.64, end: 0.98, text: "ben" }, { start: 1.02, end: 1.44, text: "Samet." },
    { start: 1.9, end: 2.2, text: "Bu" }, { start: 2.22, end: 2.5, text: "klip" }, { start: 2.52, end: 2.95, text: "Suflo'nun" },
    { start: 2.98, end: 3.4, text: "örnek" }, { start: 3.42, end: 3.9, text: "videosu." }, { start: 4.6, end: 4.9, text: "Türkçe" },
    { start: 4.92, end: 5.5, text: "altyazıyı" }, { start: 5.52, end: 5.8, text: "iki" }, { start: 5.82, end: 6.3, text: "dakikada" },
    { start: 6.32, end: 6.9, text: "çıkarıyoruz." }, { start: 7.0, end: 7.05, text: "..." }
  ],
  segments: [
    { start: 0.32, end: 1.44, text: "Merhaba, ben Samet." },
    { start: 1.9, end: 3.9, text: "Bu klip Suflo'nun örnek videosu." },
    { start: 4.6, end: 6.9, text: "Türkçe altyazıyı iki dakikada çıkarıyoruz, Premiere'in içinde, kredi yok, abonelik yok, hesap yok." }
  ]
};
// 3.0 go()'sunun satır kurma kodunun birebir kopyası (yeniden düzenleme öncesi davranış)
function eskiGo(raw, lenVal, seqOffset) {
  var mapped = raw.map(function (s) { return { start: seqOffset + s.start, end: seqOffset + s.end, text: s.text, confidence: s.confidence }; })
    .filter(function (s) { return s.text; });
  var segs, mode;
  if (/^k/.test(lenVal)) {
    mapped = mapped.filter(function (s) { return s.text.replace(/[.,!?;:…]/g, "").trim(); });
    if (mapped.length >= 8) {
      var tMin = mapped[0].start, tMax = mapped[0].start;
      mapped.forEach(function (s) { if (s.start < tMin) tMin = s.start; if (s.start > tMax) tMax = s.start; });
      if (tMax - tMin < 1) throw new Error("ayni an");
    }
    segs = lenVal === "kc" ? CT.karaokeCumulative(mapped, 4) : CT.karaokeWords(mapped);
    mode = lenVal === "kc" ? "kc" : "k1";
  } else {
    mapped = CT.cleanSegments(mapped);
    mapped = CT.trimOverlongCues(mapped);
    if (/^w\d+$/.test(lenVal)) { segs = CT.splitWords(mapped, parseInt(lenVal.slice(1), 10) || 3); mode = "w"; }
    else { segs = CT.splitLong(mapped, parseInt(lenVal.slice(1), 10) || 42, 4.5); mode = "plain"; }
  }
  return { segments: segs, mode: mode };
}
var veri = SO.ornekKelimeleri(ORNEK);
["k1", "kc", "w3", "c42"].forEach(function (mod) {
  [0, 12.5].forEach(function (offset) {
    var motorCiktisi = /^k/.test(mod) ? ORNEK.words : ORNEK.segments;
    var beklenen = eskiGo(motorCiktisi, mod, offset);
    var gercek = CT.segmentleriKur(SO.ornekGirdisi(veri, mod, offset), mod);
    ok("örnek transkript = go() (" + mod + ", offset " + offset + ")", J(gercek) === J(beklenen) && gercek.segments.length > 0,
      gercek.segments.length + " satır · " + J(gercek.segments[0]));
  });
});
ok("satırlar yoksa kelimelerden kurulur (cümle sonu/boşlukta yeni satır)", J(SO.ornekKelimeleri(ORNEK.words).segments.map(function (s) { return s.text; })) ===
  J(["Merhaba, ben Samet.", "Bu klip Suflo'nun örnek videosu.", "Türkçe altyazıyı iki dakikada çıkarıyoruz.", "..."]), J(SO.ornekKelimeleri(ORNEK.words).segments));
ok("bozuk kayıtlar atılır, sıralanır", SO.ornekKelimeleri({ words: [{ start: 2, end: 1, text: "x" }, { start: 1, end: 1.2, text: "b" }, { start: 0, end: 0.5, text: "a" }, { start: 3, end: 4 }] }).words.map(function (w) { return w.text; }).join("") === "ab");
var hepsiAyni = []; for (var hi = 0; hi < 9; hi++) hepsiAyni.push({ start: 3, end: 3.1, text: "k" + hi });
var ayniHata = null;
try { CT.segmentleriKur(hepsiAyni, "k1"); } catch (e) { ayniHata = e; }
ok("kelime zamanları bozuksa (hepsi aynı an) go() ile aynı hata + günlük ayrıntısı", ayniHata && /aynı anda/.test(ayniHata.message) && /9 kelimenin tümü 3\.00 sn/.test(ayniHata.ayrinti), ayniHata && ayniHata.ayrinti);

// tools/ornek-transkript.js: whisper-cli JSON (-oj) → panelin okuduğu hazır transkript
var OT = require(path.join(KOK, "tools", "ornek-transkript.js"));
function wj(liste, dil) {
  return { result: { language: dil || "turkish" }, transcription: liste.map(function (x) {
    return { offsets: { from: Math.round(x[0] * 1000), to: Math.round(x[1] * 1000) }, text: x[2] };
  }) };
}
var donusen = OT.donustur(wj([[0.32, 0.61, " Merhaba,"], [0.64, 0.98, " ben"], [1.0, 1.0, " ."], [1.02, 1.44, " Samet."]]),
  { transcription: [{ timestamps: { from: "00:00:00,320", to: "00:00:01,440" }, text: " Merhaba, ben Samet." }] });
ok("ornek-transkript: kelime + satır, noktalama belirteci atılır, dil kodu", donusen.lang === "tr" && donusen.words.length === 3 &&
  donusen.words[2].text === "Samet." && donusen.segments.length === 1 && donusen.segments[0].end === 1.44, J(donusen));
ok("ornek-transkript çıktısı panelde aynı satırları verir", J(SO.ornekKelimeleri(donusen).words) === J(donusen.words));

// captions.js: go() ve ornekYukle AYNI kurucuyu kullanır; tıklama MouseEvent'i örnek sanılmaz
var capSrc = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8");
var goGovde = capSrc.slice(capSrc.indexOf("async function go(opts)"), capSrc.indexOf("function setBusy("));
ok("go() satırları CT.segmentleriKur ile kurar", /CT\.segmentleriKur\(mapped, lenVal\)/.test(goGovde) && !/karaokeWords\(mapped\)/.test(goGovde));
ok("go(opts): opts.ornek ayrıca sınanır (MouseEvent geçebilir)", /opts && opts\.ornek && opts\.ornek\.wav/.test(goGovde));
ok("go(ornek): ffmpeg ön denetimi ve kapsam/dışa aktarım atlanır", /if \(!ornek && !\(await K\.findFfmpeg\(\)\)\)/.test(goGovde) && /if \(ornek\) \{[\s\S]*?\} else if \(scope === "clip"\)/.test(goGovde));
ok("go(ornek): örnek dosyaları geçici listeye girmez (silinmez)", !/tempFiles\.push\(ornek|tempFiles\.push\(audioSrc\);\s*\n\s*\} else if \(scope/.test(goGovde) &&
  /ornek dosyalari ayar klasorunde kalici: tempFiles'a EKLENMEZ/.test(goGovde));
var yukleGovde = capSrc.slice(capSrc.indexOf("function ornekYukle("), capSrc.indexOf("function setBusy("));
ok("ornekYukle aynı kurucu + anlık görüntü/geri al yolu", /CT\.segmentleriKur\(girdi, lenVal\)/.test(capSrc) && /snapshot\("örnek transkript"\)/.test(capSrc));
ok("dil #cap-lang'i değiştirmeden motorlara geçer", /transcribeLocal\(audioPath, wordLevel, secenek\.dil\)/.test(capSrc) &&
  /transcribeCloud\(cloudAudio, durHint, wordLevel, secenek\.dil\)/.test(capSrc) && !/el\("cap-lang"\)\.value\s*=/.test(goGovde) &&
  /motorSecenek = \{ dil: ornek\.lang \|\| "tr"/.test(goGovde));
var ksGovde = capSrc.slice(capSrc.indexOf("function anahtarKaydet("), capSrc.indexOf("function ayarDegisti("));
ok("anahtarKaydet: yerel motor hazırsa 'local' kalır, değilse groq; Ayarlar alanlarına yansır",
  /if \(!K\.whisperLocal\(\)\) s\.provider = "groq"/.test(ksGovde) && /set-apikey/.test(ksGovde) && /set-provider/.test(ksGovde) && /ayarDegisti\("anahtar"\)/.test(ksGovde));

/* ================= 7) AI düğmeleri: Pro kapısı anahtar denetiminden ÖNCE ================= */
[["js/viral.js", "Viral anlar", "highlights"], ["js/broll-ui.js", "B-roll önerileri", "highlights"], ["js/captions.js", "Çeviri", "translate"]].forEach(function (x) {
  var src = fs.readFileSync(path.join(KOK, x[0]), "utf8");
  var istek = src.indexOf('KOnboarding.anahtarIste("' + x[1] + '")');
  var kapi = src.lastIndexOf('Pro.gate("' + x[2] + '")', istek);
  ok(x[0] + ": anahtar yoksa sihirbaz; Pro kapısı önce", istek > 0 && kapi > 0 && kapi < istek);
});
["js/bolumler.js", "js/kanca.js", "js/captions.js", "js/viral.js", "js/broll-ui.js"].forEach(function (f) {
  var src = fs.readFileSync(path.join(KOK, f), "utf8");
  var eski = (src.match(/if \(!cfg\) \{ KApp\.toast\(/g) || []).length;
  ok(f + ": anahtarsız AI bildirimi sihirbaza yönlenir (eski toast yalnız yedek)", eski === 0 && /window\.KOnboarding \? |if \(window\.KOnboarding\) KOnboarding\.anahtarIste/.test(src));
});

/* ================= 8) KURAL: onboarding.js tıklamadan Premiere'e dokunmaz ================= */
var obSrc = fs.readFileSync(path.join(KOK, "js", "onboarding.js"), "utf8").replace(/\r\n/g, "\n");
var temiz = ayikla(obSrc);
// adlı işlev aralıkları
var islevler = [], re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g, m;
while ((m = re.exec(temiz))) {
  var ac = temiz.indexOf("{", m.index), derinlik = 0, son = -1;
  for (var q = ac; q < temiz.length; q++) {
    if (temiz[q] === "{") derinlik++;
    else if (temiz[q] === "}") { derinlik--; if (!derinlik) { son = q; break; } }
  }
  islevler.push({ ad: m[1], bas: m.index, son: son });
}
var HOST = /\bK\.call\s*\(|evalScript|\bKApp\.pollNow\s*\(|\bKApp\.refreshContext\s*\(|\bKCaptions\.go\s*\(|\bKCaptions\.applyStyled\s*\(/g;
var ihlal = [], hostSayisi = 0;
while ((m = HOST.exec(temiz))) {
  hostSayisi++;
  var konum = m.index;
  var sahipler = islevler.filter(function (f) { return f.bas < konum && konum < f.son; });
  if (!sahipler.some(function (f) { return /Tikla$/.test(f.ad); })) {
    ihlal.push(m[0] + " @" + temiz.slice(0, konum).split("\n").length + " (" + sahipler.map(function (f) { return f.ad; }).join(">") + ")");
  }
}
ok("onboarding.js: Premiere çağrıları var ve yalnız *Tikla işleyicilerinde", hostSayisi >= 3 && ihlal.length === 0, ihlal.join(" | ") || hostSayisi + " çağrı");
ok("onboarding.js: evalScript doğrudan hiç yok", !/evalScript/.test(temiz));
var tiklaHelper = /function tikla\(id, fn\) \{\s*var e = el\(id\);\s*if \(e\) e\.addEventListener\("click", fn\);\s*\}/.test(obSrc);
var tiklaRef = [], tre = /\b([A-Za-z_$][\w$]*Tikla)\b/g;
while ((m = tre.exec(temiz))) {
  var ad = m[1];
  if (ad === "cipTiklandi") continue;
  var once = obSrc.slice(Math.max(0, m.index - 60), m.index);
  var tanim = /function\s+$/.test(once);
  var tikBagla = /tikla\("[\w-]+", $/.test(once) || /addEventListener\("click", $/.test(once);
  if (!tanim && !tikBagla) tiklaRef.push(ad + " @" + temiz.slice(0, m.index).split("\n").length);
}
ok("*Tikla işleyicileri yalnız click olayına bağlanır (init'ten çağrılmaz)", tiklaHelper && tiklaRef.length === 0, tiklaRef.join(" | "));

// Çalıştırarak: sahte DOM + sahte K ile init → hiçbir Premiere çağrısı yok
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
function sahte(opts) {
  opts = opts || {};
  var say = { call: 0, eval: 0, poll: 0, run: 0, kaydet: 0, ornekYukle: 0, go: 0, toast: [] };
  var ogeler = {};
  function Oge(id, tag) {
    var o = {
      id: id || "", tagName: (tag || "div").toUpperCase(), hidden: false, disabled: false, textContent: "", title: "", value: "",
      className: "", style: {}, _olay: {}, _attr: {}, parentNode: null, nextSibling: null, children: [],
      classList: {
        _s: {},
        add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; },
        toggle: function (c, v) { if (v === undefined ? !this._s[c] : v) this._s[c] = 1; else delete this._s[c]; },
        contains: function (c) { return !!this._s[c]; }
      },
      addEventListener: function (t, fn) { (this._olay[t] = this._olay[t] || []).push(fn); },
      setAttribute: function (a, v) { this._attr[a] = String(v); }, getAttribute: function (a) { return this._attr[a] === undefined ? null : this._attr[a]; },
      insertBefore: function (c) { c.parentNode = this; this.children.push(c); if (c.id) ogeler[c.id] = c; return c; },
      appendChild: function (c) { c.parentNode = this; this.children.push(c); if (c.id) ogeler[c.id] = c; return c; },
      focus: function () {}, scrollIntoView: function () {}
    };
    return o;
  }
  var genel = Oge("genel");
  (html.match(/id="[^"]+"/g) || []).forEach(function (x) {
    var id = x.slice(4, -1);
    ogeler[id] = Oge(id);
    ogeler[id].parentNode = genel;
    if (/hidden/.test(html.slice(html.indexOf(x), html.indexOf(">", html.indexOf(x))))) ogeler[id].hidden = true;
  });
  var belge = {
    getElementById: function (id) { return ogeler[id] || null; },
    createElement: function (t) { return Oge("", t); },
    addEventListener: function () {},
    dispatchEvent: function () {}
  };
  var ayarlar = opts.ayarlar || {};
  var ext = opts.ext || fs.mkdtempSync(path.join(os.tmpdir(), "suflo-ob-ext-"));
  var K = {
    nodeOK: true, MAC: false, fs: fs, path: path, os: { totalmem: function () { return 16 * 1073741824; } },
    settings: function () { return ayarlar; }, saveSettings: function () { say.kaydet++; return true; },
    ayarDosyasiVardi: function () { return !!opts.ayarVardi; },
    settingsPath: function () { return path.join(opts.ayarDizini || os.tmpdir(), "settings.json"); },
    extensionPath: function () { return ext; },
    whisperLocal: function () { return opts.model ? { exe: "w", model: "m" } : null; },
    brewYolu: function () { return null; },
    log: function () {}, hataYardimi: function (e) { return String(e && e.message || e); },
    call: function (fn, arg) { say.call++; say.son = fn; say.arg = arg; return Promise.resolve(opts.cevap || { ok: true, offset: 4, sequenceId: "s1" }); },
    run: function () { say.run++; return Promise.resolve({ code: 1, stdout: "" }); },
    httpGet: function () { return Promise.resolve({ status: 200 }); },
    cs: { evalScript: function () { say.eval++; }, openURLInDefaultBrowser: function () {} }
  };
  var win = {
    K: K,
    KEngine: {
      activeModel: function () { return opts.model ? { id: "small", label: "Small — dengeli" } : null; },
      installedModels: function () { return opts.model ? [{ id: "small" }] : []; },
      gpuInfo: function () { return null; }, installedBuild: function () { return "cpu"; }
    },
    KCaptions: {
      chatConfig: function () { return ayarlar.apiKey ? { key: ayarlar.apiKey } : null; },
      onSonuc: function (fn) { win._sonuc = fn; },
      engineReady: function () { return !!opts.model; },
      go: function () { say.go++; return Promise.resolve(true); },
      ornekYukle: function (v, off) { say.ornekYukle++; say.ornekVeri = v; say.ornekOffset = off; return true; },
      stilYedegi: function () { return {}; }, stilYedeginiYukle: function () {}, stilDene: function () { return true; },
      hasSegments: function () { return false; }, applyStyled: function () {}, refreshSetup: function () {}, ayarDegisti: function () {},
      anahtarKaydet: function (k) { ayarlar.apiKey = k; return true; }
    },
    KApp: {
      yenilikSurumu: function () { return "3.0"; }, toast: function (m) { say.toast.push(m); }, goster: function () {},
      pollNow: function () { say.poll++; }, refreshContext: function () { say.poll++; }, installLocalWhisper: function () { return Promise.resolve(null); }
    },
    Pro: { isPro: function () { return false; }, gate: function () { return false; }, on: function () {} },
    document: belge
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "onboarding-steps.js"), "utf8"), win);
  vm.runInContext(obSrc, win);
  return { win: win, say: say, ogeler: ogeler, ayarlar: ayarlar, OB: win.KOnboarding };
}

var t1 = sahte({ ayarVardi: false });
t1.OB.init();
ok("init (taze kurulum): K.call / evalScript / bağlam yoklaması YOK", t1.say.call === 0 && t1.say.eval === 0 && t1.say.poll === 0 && t1.say.run === 0, J(t1.say));
ok("taze kurulum: tam kart görünür, karar 'tam'", t1.OB.karar() === "tam" && t1.ogeler["ilk-adim"].hidden === false);
ok("taze kurulum: yenilikler 'görüldü' sayılır (iki pencere üst üste binmez)", t1.ayarlar.yeniliklerGoruldu === "3.0" && t1.ayarlar.onboarding && t1.ayarlar.onboarding.surum === 1);
ok("ilerleme çipi bağlam şeridinin kardeşi ve 'Kurulum 0/4'", t1.ogeler["onb-chip"].hidden === false && t1.ogeler["onb-chip"].textContent === "Kurulum 0/4" &&
  html.indexOf('id="onb-chip"') > html.indexOf('id="context-strip"') && html.indexOf('id="onb-chip"') > html.indexOf("</div>", html.indexOf('id="context-strip"')));
ok("tek kurulum kartı: #cap-setup motor adımına taşındı", t1.ogeler["cap-setup"].parentNode === t1.ogeler["ia-motor-govde"]);
ok("AI düğmelerinin yanına 'anahtar gerekli · 1 dk' çipleri eklendi", ["cap-proofread", "cap-translate-go", "cap-ch-ai", "cap-yt-go", "cap-vr-bul", "cap-br-bul", "kanca-ai"].every(function (id) {
  var p = t1.ogeler[id].parentNode;
  return p.children.some(function (c) { return c.id === id + "-anahtar" && c.textContent === "anahtar gerekli · 1 dk" && !c.hidden; });
}));
ok("motor adımı aktif, sıradaki işaretli", /aktif/.test(t1.ogeler["ia-motor"].className) && t1.ogeler["ilk-adim-sayac"].textContent === "0/4");
var sec = t1.OB.kurulumSecenekleri();
ok("rehber açıkken kurulum: Small, cuBLAS yok, ffmpeg arkada", J(sec) === J({ modelId: "small", useGpu: false, ffmpegArkada: true }) && t1.ayarlar.onboarding.model === "small", J(sec));

// Örnek dosyası olmadan "Altyazı oluştur'a git" Premiere'e dokunmaz
var dugme = t1.ogeler["ia-ornek-dene"];
ok("örnek yokken 2. adım 'kendi klibinle' talimatı", t1.ogeler["ia-ornek-baslik"].textContent === "İlk altyazın" && dugme.textContent === "Altyazı oluştur'a git");
Promise.resolve(dugme._olay.click[0]()).then(function () {
  ok("örnek yokken düğme yalnız kaydırır (K.call yok)", t1.say.call === 0 && t1.say.poll === 0);

  // Örnek dosyalarıyla: K.call yalnız TIKLAMADA, motor yoksa hazır transkript yüklenir
  var ext = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-ob-ornek-"));
  var dizin = path.join(ext, "assets", "onboarding");
  fs.mkdirSync(dizin, { recursive: true });
  fs.writeFileSync(path.join(dizin, "ornek.json"), J({ surum: 1, lang: "tr", video: "ornek-tr.mp4", wav: "ornek-tr.wav", mp3: "ornek-tr.mp3", words: "ornek-tr.words.json", sure: 15 }));
  fs.writeFileSync(path.join(dizin, "ornek-tr.mp4"), "mp4");
  fs.writeFileSync(path.join(dizin, "ornek-tr.wav"), wav(16000, 1, 16));
  fs.writeFileSync(path.join(dizin, "ornek-tr.mp3"), "mp3");
  fs.writeFileSync(path.join(dizin, "ornek-tr.words.json"), J(ORNEK));
  var ayarDizini = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-ob-ayar-"));
  var t2 = sahte({ ayarVardi: true, ext: ext, ayarDizini: ayarDizini, ayarlar: { yeniliklerGoruldu: "3.0" } });
  t2.OB.init();
  ok("takılı kullanıcı (ayar var, motor/anahtar yok): tam kart, yenilik ayarına dokunulmaz", t2.OB.karar() === "tam" && t2.ayarlar.yeniliklerGoruldu === "3.0" && t2.say.call === 0);
  ok("örnek varken 2. adım 'Örnekte dene'", t2.ogeler["ia-ornek-baslik"].textContent === "Örnekte dene" && t2.ogeler["ia-ornek-dene"].textContent === "Örnekte dene");
  return Promise.resolve(t2.ogeler["ia-ornek-dene"]._olay.click[0]()).then(function () {
    var kopya = path.join(ayarDizini, "onboarding", "ornek-tr.mp4");
    ok("tıklamada KS_importSample: ayar klasörüne kopyalanan klip, 'Suflo Deneme'", t2.say.call === 1 && t2.say.son === "KS_importSample" &&
      t2.say.arg.path === kopya && t2.say.arg.seqName === "Suflo Deneme" && fs.existsSync(kopya), J(t2.say.arg));
    ok("tıklamadan sonra bağlam tazelendi", t2.say.poll === 1);
    ok("motor/anahtar yokken hazır transkript yüklendi (offset sekanstaki yerden)", t2.say.go === 0 && t2.say.ornekYukle === 1 && t2.say.ornekOffset === 4 &&
      t2.say.ornekVeri.words.length === ORNEK.words.length);
    ok("örnek adımı tamam, 'Normal altyazı izi ekle' vurgulandı", t2.ayarlar.onboarding.adimlar.ornek === "tamam" && t2.ogeler["cap-apply"].classList.contains("onb-vurgu"));

    // Motor varken go({ornek}) çağrılır, dosyalar yeniden kopyalanmaz
    var t3 = sahte({ ayarVardi: false, ext: ext, ayarDizini: ayarDizini, model: true });
    t3.OB.init();
    return Promise.resolve(t3.ogeler["ia-ornek-dene"]._olay.click[0]()).then(function () {
      ok("motor hazırken örnek go() ile çözülür", t3.say.go === 1 && t3.say.ornekYukle === 0);
      // Anahtar sihirbazı: Enter/kaydet ile doğrula → kaydet; çip gizlenir
      t3.OB.anahtarIste("Çeviri", "cip");
      ok("anahtarIste sihirbazı açar, özellik adıyla", t3.ogeler["onb-anahtar"].hidden === false && /^Çeviri ücretsiz bir Groq anahtarıyla çalışır/.test(t3.ogeler["onb-anahtar-neden"].textContent));
      t3.ogeler["onb-anahtar-girdi"].value = "  '" + KEY + "'  ";
      return Promise.resolve(t3.ogeler["onb-anahtar-kaydet"]._olay.click[0]()).then(function () {
        ok("doğrulanan anahtar kaydedildi, sihirbaz kapandı, Premiere çağrısı yok", t3.ayarlar.apiKey === KEY && t3.ogeler["onb-anahtar"].hidden === true && t3.say.call === 1 && t3.say.eval === 0);
        ok("anahtar gelince AI çipleri gizlenir", t3.ogeler["cap-vr-bul"].parentNode.children.filter(function (c) { return c.id === "cap-vr-bul-anahtar"; }).every(function (c) { return c.hidden; }));
        ok("anahtar hiçbir bildirimde görünmez", t3.say.toast.every(function (x) { return x.indexOf(KEY) === -1; }));
      });
    });
  });
}).then(function () {
  // Yükselten, anahtarsız: yalnız AI anahtarı çipi
  var t4 = sahte({ ayarVardi: true, model: true, ayarlar: { yeniliklerGoruldu: "3.0", basariliUygulama: 4 } });
  t4.OB.init();
  ok("yükselten anahtarsız kullanıcı: kart yok, 'AI anahtarı · 1 dk' çipi", t4.OB.karar() === "cip" && t4.ogeler["ilk-adim"].hidden === true &&
    t4.ogeler["onb-chip"].hidden === false && t4.ogeler["onb-chip"].getAttribute("data-mod") === "anahtar" && t4.say.call === 0);
  ok("kart açılmayınca #cap-setup yerinde kalır", t4.ogeler["cap-setup"].parentNode !== t4.ogeler["ia-motor-govde"]);
  // Kapatılan rehber Ayarlar > Destek'ten geri gelir
  var t5 = sahte({ ayarVardi: false });
  t5.OB.init();
  t5.ogeler["ilk-adim-kapat"]._olay.click[0]();
  ok("✕ rehberi kapatır ve kalıcı yazar", t5.ogeler["ilk-adim"].hidden === true && t5.ayarlar.onboarding.kapandi === true && t5.ogeler["onb-chip"].hidden === true);
  t5.ogeler["set-onb-ac"]._olay.click[0]();
  ok("'Kurulum rehberini aç' geri getirir", t5.ogeler["ilk-adim"].hidden === false && t5.ayarlar.onboarding.kapandi === false && t5.OB.karar() === "tam");
  t5.ogeler["ilk-adim-atla"]._olay.click[0]();
  ok("'Atla' sıradaki adımı atlar", t5.ayarlar.onboarding.adimlar.motor === "atlandi" && /aktif/.test(t5.ogeler["ia-ornek"].className));

  /* ================= 9) index.html / app.js bağlantıları ================= */
  var appSrc = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8");
  ok("app.js: rehber guvenli('Onboarding') ile başlar", /guvenli\("Onboarding", function \(\) \{ if \(window\.KOnboarding\) KOnboarding\.init\(\); \}\)/.test(appSrc));
  ok("app.js: rehber tam kartken yenilikler penceresi açılmaz", /if \(rehber !== "tam"\) yenilikleriGoster\(\)/.test(appSrc));
  var sira = ["js/captions.js", "js/onboarding-steps.js", "js/onboarding.js", "js/app.js"].map(function (f) { return html.indexOf('<script src="' + f + '"'); });
  ok("betik sırası: captions → onboarding-steps → onboarding → app", sira.every(function (x, i) { return x > 0 && (i === 0 || x > sira[i - 1]); }), J(sira));
  ok("kart Altyazı sekmesinin en üstünde, kurulum notundan önce", html.indexOf('id="ilk-adim"') > html.indexOf('id="tab-captions"') && html.indexOf('id="ilk-adim"') < html.indexOf('id="cap-setup"'));
  ok("Ayarlar > Destek'te 'Kurulum rehberini aç'", /<button id="set-onb-ac"[^>]*>Kurulum rehberini aç<\/button>/.test(html));

  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}).catch(function (e) {
  console.log("FAIL beklenmeyen hata: " + (e && e.stack || e));
  process.exit(1);
});
