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
// Rehber başladı ama bitmedi (kayıt yalnız tam kartken yazılır): ikinci açılışta da tam kalır
var surenKayit = SO.yeniKayit(); surenKayit.adimlar.motor = "tamam";
ok("başlamış rehber + model kurulmuş (2. açılış) → tam (çipe düşmez)", K1({ ayarDosyasiVardi: true, onboarding: surenKayit, modelVar: true, apiKey: "" }) === "tam");
ok("başlamış rehber + önce anahtar kaydedilmiş (2. açılış) → tam (kaybolmaz)", K1({ ayarDosyasiVardi: true, onboarding: SO.yeniKayit(), modelVar: false, apiKey: "gsk_x" }) === "tam");
ok("başlamış rehber kapatıldı/bitti → yok", K1({ ayarDosyasiVardi: true, onboarding: { surum: 1, kapandi: true }, modelVar: true }) === "yok" &&
  K1({ ayarDosyasiVardi: true, onboarding: { surum: 1, bitti: true }, apiKey: "gsk_x" }) === "yok");
ok("sürümsüz/bozuk kayıt rehberi zorla açmaz", K1({ ayarDosyasiVardi: true, onboarding: { adimlar: {} }, modelVar: true, apiKey: "" }) === "cip" &&
  K1({ ayarDosyasiVardi: true, onboarding: "x", modelVar: true, apiKey: "gsk_x" }) === "yok");

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

var yedekli = SO.kayitDuzelt({ surum: 1, stilYedek: { alan: { "cap-preset": "" }, prefs: null } });
ok("kayıt stil yedeğini korur; bozuk yedek atılır", !!yedekli.stilYedek && yedekli.stilYedek.alan["cap-preset"] === "" &&
  !SO.kayitDuzelt({ stilYedek: { alan: "x" } }).stilYedek && !SO.kayitDuzelt({ stilYedek: [1] }).stilYedek);

/* ---- stil adımında hangi dokunuş bilinçli seçim (yedeği bırakır)? ---- */
var SEC = SO.stilDokunusuSecimMi;
ok("ücretsiz: kart dokunuşu önizlemedir, seçim sayılmaz (kilitsiz ve seçili olsa da)", SEC({ tur: "kart", pro: false, kart: true, kilitli: false, secili: true }) === false);
ok("Pro: kilitsiz ve seçime geçen karta dokunuş seçimdir", SEC({ tur: "kart", pro: true, kart: true, kilitli: false, secili: true }) === true);
ok("Pro: kilitli karta (satış penceresi) ya da ızgara boşluğuna dokunuş seçim değil",
  SEC({ tur: "kart", pro: true, kart: true, kilitli: true, secili: false }) === false && SEC({ tur: "kart", pro: true, kart: false }) === false);
ok("Pro: seçim karta geçmediyse (.secili yok) seçim değil", SEC({ tur: "kart", pro: true, kart: true, kilitli: false, secili: false }) === false);
ok("ücretsiz: yalnız ücretsiz izi etkileyen ayar (uzunluk, harf, noktalama) seçimdir",
  ["cap-maxlen", "cap-case", "cap-punct"].every(function (id) { return SEC({ tur: "ayar", pro: false, id: id }) === true; }) &&
  ["cap-boyut", "cap-renk", "cap-font", "cap-preset", ""].every(function (id) { return SEC({ tur: "ayar", pro: false, id: id }) === false; }));
ok("Pro: her görünüm ayarı seçimdir; bilinmeyen tür hiçbir zaman", SEC({ tur: "ayar", pro: true, id: "cap-boyut" }) === true && SEC({ pro: true }) === false && SEC() === false);
function dugum(sinif, ebeveyn) {
  return { className: sinif, parentNode: ebeveyn || null };
}
var izgara = dugum("stil-grid");
var kartK = dugum("stil-sec stil-mogrt locked", izgara), kartS = dugum("stil-sec stil-motor secili", izgara);
var baslik = dugum("stil-mogrt-head stil-motor-head", izgara);
ok("tıklama hedefi kartın içindeki öğeyse kart bulunur (seçili)", J(SO.stilTiklamasi(dugum("sm-k", dugum("sm-ornek", dugum("ss-sahne", kartS))), izgara)) === J({ kart: true, kilitli: false, secili: true }));
ok("kilitli şablon kartı kilitli sayılır", J(SO.stilTiklamasi(dugum("", kartK), izgara)) === J({ kart: true, kilitli: true, secili: false }));
ok("ızgara boşluğu ve başlık kart değil; 'stil-secili' gibi benzer sınıf kart sayılmaz",
  !SO.stilTiklamasi(izgara, izgara).kart && !SO.stilTiklamasi(dugum("b", baslik), izgara).kart &&
  !SO.stilTiklamasi(dugum("stil-secili", izgara), izgara).kart && !SO.stilTiklamasi(null, izgara).kart);

/* ---- stil denemesi bitince yalnız görünüm tercihleri döner (dil korunur) ---- */
var TG = SO.stilTercihiGeriYukle;
ok("deneme sırasında dil değişti: görünüm önceki, dil yeni", J(TG({ lang: "en", preset: "mrbeast", motorStili: "mrbeast", maxlen: "k1", stil: { aile: "mrbeast" } },
  { lang: "tr", preset: "", motorStili: "", maxlen: "c42", stil: { aile: "klasik" } })) === J({ lang: "en", preset: "", motorStili: "", maxlen: "c42", stil: { aile: "klasik" } }));
ok("önceden tercih yoktu: görünüm alanları silinir, dil kalır (tercih silinmez)", J(TG({ lang: "en", preset: "mrbeast", motorStili: "mrbeast", stil: {} }, null)) === J({ lang: "en" }));
ok("önceden tercih yok, deneme hiçbir şey kaydetmedi → null (sil)", TG(undefined, null) === null && TG({ preset: "mrbeast", motorStili: "mrbeast" }, null) === null);
ok("şimdiki tercih yoksa önceki aynen döner (kopya)", J(TG(null, { lang: "tr", preset: "" })) === J({ lang: "tr", preset: "" }));

/* ---- kurulum seçenekleri: kurulu cuBLAS ezilmez, ffmpeg yalnız örnek varken arkada ---- */
ok("ilk kurulum: cuBLAS yok, örnek yoksa ffmpeg önden (ilerleme düğmede)", J(SO.kurulumSecenekleri({ model: "small" })) === J({ modelId: "small", useGpu: false, ffmpegArkada: false }));
ok("çalışan cuBLAS motoru kuruluysa korunur (CPU zip'i inmez)", SO.kurulumSecenekleri({ model: "small", cudaKurulu: true }).useGpu === true);
ok("örnek klip varsa ffmpeg arkaya bırakılır", SO.kurulumSecenekleri({ model: "small", ornekVar: true }).ffmpegArkada === true);

/* ---- Pro'ya bağlı yapay zekâ özellikleri ve metinler ---- */
ok("Pro'ya bağlı AI özellikleri: Çeviri/SRT paketi translate, Viral/B-roll highlights; diğerleri ücretsiz",
  SO.aiProOzelligi("Çeviri") === "translate" && SO.aiProOzelligi("Çok dilli SRT paketi") === "translate" && SO.aiProOzelligi("Viral anlar") === "highlights" &&
  SO.aiProOzelligi("B-roll önerileri") === "highlights" && SO.aiProOzelligi("AI metin kontrolü") === "" && SO.aiProOzelligi("Kanca önerileri") === "" && SO.aiProOzelligi("") === "");
ok("ücretsiz kullanıcıya çeviri/viral 'anahtarla çalışır' denmez, Pro olduğu söylenir",
  [SO.aiMetni(false, false), SO.aiMetni(false, true)].every(function (m) { return /^(AI metin kontrolü|Yapay zekâ açık: AI metin)/.test(m) && /Çeviri, viral anlar ve B-roll[^.]*Pro'da/.test(m); }));
ok("Pro kullanıcıya tüm liste", /^Çeviri, AI metin kontrolü, viral anlar, B-roll/.test(SO.aiMetni(true, false)) && /çeviri/.test(SO.aiMetni(true, true)));

/* ---- örnek klip host sonucu ---- */
ok("KS_importSample: açık + klip içinde → hazir; sürükleme → surukle; açılamadı → ac",
  SO.ornekSonucu({ ok: true, active: true, needsDrag: false }) === "hazir" && SO.ornekSonucu({ ok: true, needsDrag: true, active: false }) === "surukle" &&
  SO.ornekSonucu({ ok: true, needsDrag: false, active: false }) === "ac" && SO.ornekSonucu({ ok: false }) === "hata");
ok("host hata kodu düzgün Türkçe metne çevrilir (ASCII host metni gösterilmez)",
  SO.ornekHataMetni({ ok: false, kod: "proje-yok", error: "Acik proje yok." }) === "Açık proje yok. Önce bir proje aç ya da yeni bir proje oluştur, sonra tekrar dene." &&
  /^Örnek klip bulunamadı/.test(SO.ornekHataMetni({ kod: "dosya-yok" })) && /^Örnek klip projeye alınamadı/.test(SO.ornekHataMetni({ kod: "ice-alinamadi" })) &&
  SO.ornekHataMetni({ error: "x" }) === "x" && SO.ornekHataMetni(null) === "Premiere örnek klibi alamadı.");
var EN = require(path.join(KOK, "i18n", "en.js"));
ok("host hata metinlerinin İngilizcesi var", ["proje-yok", "yol-yok", "dosya-yok", "ice-alinamadi"].every(function (k) {
  return !!EN.strings[SO.ornekHataMetni({ kod: k })];
}));
var hAtla = H(null, { ornekVar: true });
ok("'Atla': başlığı açılmış bekleyen adım varsa onu, yoksa sıradakini atlar",
  SO.atlanacakAdim(hAtla, "ai") === "ai" && SO.atlanacakAdim(hAtla, "") === "motor" &&
  SO.atlanacakAdim(H(null, { modelVar: true, ornekVar: true }), "motor") === "ornek" && SO.atlanacakAdim(null, "ai") === null);

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
// Örnek transkript, henüz kurtarılmamış taslağı (tek draft.json) ezmez ve "Kurtar"ı gizlemez
ok("örnek belge taslak olarak yazılmaz", /function writeDraft\(\) \{\s*if \(ornekBelge\) return;/.test(capSrc));
ok("ornekYukle: örnek bayrağı, Kurtar teklifi gizlenmez", /ornekBelge = true;/.test(yukleGovde) && !/hideRestore\(\)/.test(yukleGovde));
ok("go(ornek): Kurtar teklifi yalnız gerçek transkriptte gizlenir", /ornekBelge = !!ornek;\s*\n\s*if \(!ornek\) hideRestore\(\);/.test(goGovde));
ok("geri al/yinele örnek bayrağını taşır", /shorts: shortsYuklenen, ornek: ornekBelge/.test(capSrc) && /if \(typeof st\.ornek === "boolean"\) ornekBelge = st\.ornek;/.test(capSrc));
ok("gerçek belge yükleyen yollar bayrağı indirir (kurtarma, SRT, Shorts)", (capSrc.match(/ornekBelge = false;/g) || []).length >= 3);
var uygulaGovde = capSrc.slice(capSrc.indexOf("async function apply(stilIle)"), capSrc.indexOf("async function apply(stilIle)") + 4000);
ok("örnek altyazı yalnız kendi sekansına uygulanır", /if \(ornekBelge && ornekSekansId && KApp\.ctx\(\)\.sequenceId && String\(KApp\.ctx\(\)\.sequenceId\) !== ornekSekansId\)/.test(uygulaGovde));
ok("uygulanan örnek kullanıcının taslağını silmez", /if \(!shortsYuklenen && !ornekBelge\) K\.clearDraft\(\);/.test(capSrc));
var stilGeriGovde = capSrc.slice(capSrc.indexOf("function stilYedeginiYukle("), capSrc.indexOf("function stilDene("));
ok("stil geri yükleme capPrefs'i bütünüyle ezmez (yalnız görünüm alanları)", /SufloOnboarding\.stilTercihiGeriYukle\(s\.capPrefs, eski\)/.test(stilGeriGovde) &&
  !/s\.capPrefs = JSON\.parse\(y\.prefs\)/.test(stilGeriGovde));
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
  var say = { call: 0, eval: 0, poll: 0, run: 0, kaydet: 0, ornekYukle: 0, go: 0, toast: [], stilDene: [], stilGeri: 0, styled: 0, ornekHedefi: [], gate: [] };
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
      gpuInfo: function () { return opts.build === "cuda" ? { kind: "cuda" } : null; }, installedBuild: function () { return opts.build || "cpu"; }
    },
    KCaptions: {
      chatConfig: function () { return ayarlar.apiKey ? { key: ayarlar.apiKey } : null; },
      onSonuc: function (fn) { win._sonuc = fn; },
      engineReady: function () { return !!opts.model; },
      go: function () { say.go++; return Promise.resolve(true); },
      ornekYukle: function (v, off) { say.ornekYukle++; say.ornekVeri = v; say.ornekOffset = off; return true; },
      stilYedegi: function () { return { alan: { "cap-preset": "" }, prefs: null }; },
      stilYedeginiYukle: function () { say.stilGeri++; },
      stilDene: function (id) { say.stilDene.push(id); return true; },
      stilSecili: function () { return !!opts.stilSecili || say.stilDene.length > 0; },
      stilKontrolleri: function () { return ["cap-preset", "cap-boyut", "cap-renk", "cap-maxlen"]; },
      ornekHedefi: function (id) { say.ornekHedefi.push(id); },
      anahtarSesiBulutaGonderir: function () { return !!opts.bulut; },
      hasSegments: function () { return !!opts.segments; }, applyStyled: function () { say.styled++; }, refreshSetup: function () {}, ayarDegisti: function () {},
      anahtarKaydet: function (k) { ayarlar.apiKey = k; return true; }
    },
    KApp: {
      yenilikSurumu: function () { return "3.0"; }, toast: function (m) { say.toast.push(m); }, goster: function () {},
      pollNow: function () { say.poll++; }, refreshContext: function () { say.poll++; }, installLocalWhisper: function () { return Promise.resolve(null); }
    },
    Pro: { isPro: function () { return !!opts.pro; }, gate: function (f, o) { if (!(o && o.silent)) say.gate.push(f); return !!opts.pro; }, on: function () {} },
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
function cipGorunur(t, id) {
  return t.ogeler[id].parentNode.children.some(function (c) { return c.id === id + "-anahtar" && c.textContent === "anahtar gerekli · 1 dk" && !c.hidden; });
}
ok("ücretsiz kullanıcı: ücretsiz AI düğmelerinin yanına 'anahtar gerekli · 1 dk' çipi", ["cap-proofread", "cap-ch-ai", "cap-yt-go", "kanca-ai"].every(function (id) { return cipGorunur(t1, id); }));
ok("ücretsiz kullanıcı: Pro'ya bağlı Çeviri/Viral/B-roll yanında anahtar çipi YOK (anahtar onları açmaz)",
  ["cap-translate-go", "cap-vr-bul", "cap-br-bul"].every(function (id) { return !cipGorunur(t1, id); }));
var tPro = sahte({ ayarVardi: false, pro: true });
tPro.OB.init();
ok("Pro kullanıcı: yedi AI düğmesinin hepsinde anahtar çipi", ["cap-proofread", "cap-translate-go", "cap-ch-ai", "cap-yt-go", "cap-vr-bul", "cap-br-bul", "kanca-ai"].every(function (id) { return cipGorunur(tPro, id); }));
ok("rehber 4. adım metni Pro durumuna göre", t1.ogeler["ia-ai-metin"].textContent === SO.aiMetni(false, false) && tPro.ogeler["ia-ai-metin"].textContent === SO.aiMetni(true, false));
ok("motor adımı aktif, sıradaki işaretli", /aktif/.test(t1.ogeler["ia-motor"].className) && t1.ogeler["ilk-adim-sayac"].textContent === "0/4");
var sec = t1.OB.kurulumSecenekleri();
ok("rehber açıkken kurulum: Small, cuBLAS yok; örnek yokken ffmpeg önden", J(sec) === J({ modelId: "small", useGpu: false, ffmpegArkada: false }) && t1.ayarlar.onboarding.model === "small", J(sec));
var tCuda = sahte({ ayarVardi: false, model: true, build: "cuda" });
tCuda.OB.init();
ok("rehber kurulumu çalışan cuBLAS motorunu CPU'ya düşürmez", tCuda.OB.kurulumSecenekleri().useGpu === true, J(tCuda.OB.kurulumSecenekleri()));
ok("adım başlıkları klavyeyle açılan düğmeler: aria-expanded senkron", /<button type="button" class="ia-adim-bas" id="ia-motor-bas" aria-expanded="false"/.test(html) &&
  ["motor", "ornek", "stil", "ai"].every(function (ad) { return html.indexOf('id="ia-' + ad + '-bas"') > 0 && html.indexOf('id="ia-' + ad + '-govde"') > 0; }) &&
  t1.ogeler["ia-motor-bas"].getAttribute("aria-expanded") === "true" && t1.ogeler["ia-ai-bas"].getAttribute("aria-expanded") === "false");

// Örnek dosyası yokken ve motor kurulmadan 2. adım önce motora yönlendirir; Premiere'e dokunmaz
var dugme = t1.ogeler["ia-ornek-dene"];
ok("örnek ve motor yokken 2. adım 'önce motoru kur' der", t1.ogeler["ia-ornek-baslik"].textContent === "İlk altyazın" && dugme.textContent === "Motoru kur" &&
  /^Önce motoru kur/.test(t1.ogeler["ia-ornek-metin"].textContent));
var tKendi = sahte({ ayarVardi: false, model: true });
tKendi.OB.init();
ok("motor hazırken 2. adım 'kendi klibinle' talimatı", tKendi.ogeler["ia-ornek-dene"].textContent === "Altyazı oluştur'a git" &&
  tKendi.ogeler["ia-ornek-metin"].textContent === "Timeline'da bir klip seç ve Altyazı oluştur'a bas.");
Promise.resolve(dugme._olay.click[0]()).then(function () {
  ok("örnek yokken düğme yalnız kaydırır (K.call yok)", t1.say.call === 0 && t1.say.poll === 0);
  ok("motor yokken 2. adımın düğmesi 1. adımı ve kurulum kartını açar", /\bacik\b/.test(t1.ogeler["ia-motor"].className) &&
    t1.ogeler["cap-setup"].parentNode === t1.ogeler["ia-motor-govde"] && t1.ogeler["ia-motor-bas"].getAttribute("aria-expanded") === "true");

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
      t3.OB.anahtarIste("AI metin kontrolü", "cip");
      ok("anahtarIste sihirbazı açar, özellik adıyla", t3.ogeler["onb-anahtar"].hidden === false && /^AI metin kontrolü ücretsiz bir Groq anahtarıyla çalışır/.test(t3.ogeler["onb-anahtar-neden"].textContent));
      ok("yerel motor hazırken anahtar sesi buluta göndermez: onay satırı gizli", t3.ogeler["onb-anahtar-onay"].hidden === true);
      t3.OB.anahtarIste("Çeviri", "cip");
      ok("ücretsiz kullanıcıya 'Çeviri anahtarla çalışır' denmez", !/^Çeviri ücretsiz/.test(t3.ogeler["onb-anahtar-neden"].textContent) &&
        t3.ogeler["onb-anahtar-neden"].textContent === SO.aiMetni(false, false));
      t3.ogeler["onb-anahtar-girdi"].value = "  '" + KEY + "'  ";
      return Promise.resolve(t3.ogeler["onb-anahtar-kaydet"]._olay.click[0]()).then(function () {
        ok("doğrulanan anahtar kaydedildi, sihirbaz kapandı, Premiere çağrısı yok", t3.ayarlar.apiKey === KEY && t3.ogeler["onb-anahtar"].hidden === true && t3.say.call === 1 && t3.say.eval === 0);
        ok("anahtar gelince AI çipleri gizlenir", t3.ogeler["cap-vr-bul"].parentNode.children.filter(function (c) { return c.id === "cap-vr-bul-anahtar"; }).every(function (c) { return c.hidden; }));
        ok("anahtar hiçbir bildirimde görünmez", t3.say.toast.every(function (x) { return x.indexOf(KEY) === -1; }));
        ok("ücretsiz kullanıcıya kayıttan sonra 'Çeviri şimdi çalışır' denmez", t3.say.toast.every(function (x) { return x.indexOf("şimdi çalışır") === -1; }), J(t3.say.toast));
      });
    }).then(function () {
      ok("hazır örnek: uygula koruması örneğin sekansına bağlanır", J(t2.say.ornekHedefi) === J(["s1"]) && J(t3.say.ornekHedefi) === J(["s1"]));
      // Sekans var ama etkinleştirilemedi: altyazı ÇIKMAZ, uygula vurgulanmaz, adım bitmez
      var tAc = sahte({ ayarVardi: false, ext: ext, ayarDizini: ayarDizini, cevap: { ok: true, created: true, active: false, needsDrag: false, sequenceId: "s9", offset: 0 } });
      tAc.OB.init();
      return Promise.resolve(tAc.ogeler["ia-ornek-dene"]._olay.click[0]()).then(function () {
        ok("örnek sekansı açılamadıysa altyazı çıkmaz, uygula vurgulanmaz", tAc.say.ornekYukle === 0 && tAc.say.go === 0 &&
          !tAc.ogeler["cap-apply"].classList.contains("onb-vurgu") && tAc.ayarlar.onboarding.adimlar.ornek !== "tamam" &&
          /sekansı açılamadı/.test(tAc.ogeler["ia-durum"].textContent) && /warn/.test(tAc.ogeler["ia-durum"].className), tAc.ogeler["ia-durum"].textContent);
        // Eski Premiere: sekans kurulamadı → transkript yüklenir ama uygula vurgulanmaz, sekans koruması yok
        var tSur = sahte({ ayarVardi: false, ext: ext, ayarDizini: ayarDizini, cevap: { ok: true, needsDrag: true, active: false, sequenceId: "", offset: 0 } });
        tSur.OB.init();
        return Promise.resolve(tSur.ogeler["ia-ornek-dene"]._olay.click[0]()).then(function () {
          ok("sürükleme gerekiyorsa transkript yüklenir, uygula vurgulanmaz, talimat uyarı", tSur.say.ornekYukle === 1 &&
            !tSur.ogeler["cap-apply"].classList.contains("onb-vurgu") && /Yeni Öğe/.test(tSur.ogeler["ia-durum"].textContent) && J(tSur.say.ornekHedefi) === J([""]));
          var tHata = sahte({ ayarVardi: false, ext: ext, ayarDizini: ayarDizini, cevap: { ok: false, kod: "proje-yok", error: "Acik proje yok. Once bir proje ac ya da yeni proje olustur." } });
          tHata.OB.init();
          return Promise.resolve(tHata.ogeler["ia-ornek-dene"]._olay.click[0]()).then(function () {
            ok("host hata kodu kartta düzgün Türkçe (ASCII host metni değil)", tHata.ogeler["ia-durum"].textContent === "✕ Açık proje yok. Önce bir proje aç ya da yeni bir proje oluştur, sonra tekrar dene.",
              tHata.ogeler["ia-durum"].textContent);
            var tOrnekKur = sahte({ ayarVardi: false, ext: ext, ayarDizini: ayarDizini });
            tOrnekKur.OB.init();
            ok("örnek klip varken ffmpeg arkaya bırakılır", tOrnekKur.OB.kurulumSecenekleri().ffmpegArkada === true);
          });
        });
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

  /* ---- motor atlanınca kurulum kartı kaybolmaz (oturum 1 ve 2) ---- */
  var genelYer = t5.ogeler["cap-setup"].parentNode;
  ok("motor atlandı: adım kapalı, #cap-setup Altyazı sekmesindeki yerine döner", /atlandi/.test(t5.ogeler["ia-motor"].className) &&
    !/\bacik\b/.test(t5.ogeler["ia-motor"].className) && genelYer !== t5.ogeler["ia-motor-govde"] && t5.ogeler["ia-motor-bas"].getAttribute("aria-expanded") === "false");
  ok("motor atlandı ve kurulu değil: 2. adım önce motoru ister", t5.ogeler["ia-ornek-dene"].textContent === "Motoru kur" && /^Önce motoru kur/.test(t5.ogeler["ia-ornek-metin"].textContent));
  return Promise.resolve(t5.ogeler["ia-ornek-dene"]._olay.click[0]()).then(function () {
    ok("'Motoru kur' 1. adımı açar ve kurulum kartını içine alır (Premiere çağrısı yok)", /\bacik\b/.test(t5.ogeler["ia-motor"].className) &&
      t5.ogeler["cap-setup"].parentNode === t5.ogeler["ia-motor-govde"] && t5.say.call === 0);
    t5.ogeler["ia-motor-bas"]._olay.click[0]();
    ok("başlık tekrar tıklanınca adım kapanır, kart yerine döner", !/\bacik\b/.test(t5.ogeler["ia-motor"].className) && t5.ogeler["cap-setup"].parentNode !== t5.ogeler["ia-motor-govde"]);
    var t5b = sahte({ ayarVardi: true, ayarlar: t5.ayarlar });
    t5b.OB.init();
    ok("2. oturum (motor hâlâ atlandı, kurulu değil): kart açık, kurulum kartı adımın dışında görünür", t5b.OB.karar() === "tam" &&
      t5b.ogeler["cap-setup"].parentNode !== t5b.ogeler["ia-motor-govde"] && /atlandi/.test(t5b.ogeler["ia-motor"].className));

    /* ---- başlığı açılmış adımı "Atla" atlar ---- */
    var t7 = sahte({ ayarVardi: false });
    t7.OB.init();
    t7.ogeler["ia-ai-bas"]._olay.click[0]();
    ok("başlıktan açılan adım aria-expanded=true", t7.ogeler["ia-ai-bas"].getAttribute("aria-expanded") === "true" && /\bacik\b/.test(t7.ogeler["ia-ai"].className));
    t7.ogeler["ilk-adim-atla"]._olay.click[0]();
    ok("açık 4. adımda 'Atla' 4. adımı atlar (sıradaki motoru değil)", t7.ayarlar.onboarding.adimlar.ai === "atlandi" && t7.ayarlar.onboarding.adimlar.motor === "bekliyor");

    /* ---- başlamış rehber 2. açılışta kaybolmaz ---- */
    var t8 = sahte({ ayarVardi: true, model: true, ayarlar: { yeniliklerGoruldu: "3.0", onboarding: { surum: 1, adimlar: { motor: "bekliyor", ornek: "bekliyor", stil: "bekliyor", ai: "bekliyor" }, kapandi: false, bitti: false } } });
    t8.OB.init();
    ok("rehber sürerken panel yeniden açıldı (model kurulu): tam kart kalır, çipe düşmez", t8.OB.karar() === "tam" && t8.ogeler["ilk-adim"].hidden === false &&
      t8.ogeler["onb-chip"].textContent === "Kurulum 1/4");
    var t9 = sahte({ ayarVardi: true, model: true, ayarlar: { yeniliklerGoruldu: "3.0", basariliUygulama: 2 } });
    t9.OB.init();
    t9.win._sonuc({ kaynak: "go" });
    ok("rehber görmeyen (çip) kullanıcının altyazısı rehber kaydı yazmaz", t9.OB.karar() === "cip" && t9.ayarlar.onboarding === undefined);

    /* ---- stil adımı ---- */
    var s1 = sahte({ ayarVardi: false, pro: true, segments: true, model: true });
    s1.OB.init();
    s1.ogeler["ia-stil-goster"]._olay.click[0]();
    ok("'Stilleri gör' Creator Punch'ı dener, önceki görünüm kayda yazılır", J(s1.say.stilDene) === J(["mrbeast"]) && !!s1.ayarlar.onboarding.stilYedek);
    function kartTikla(t, siniflar) {
      var izg = t.ogeler["cap-stil-grid"];
      var kart = t.win.document.createElement("button");
      siniflar.forEach(function (c) { kart.classList.add(c); });
      kart.parentNode = izg;
      var ic = t.win.document.createElement("span");
      ic.parentNode = kart;
      izg._olay.click[0]({ target: ic });
    }
    ok("Pro ipucu: dokunulan kart seçim olarak kalır", s1.ogeler["ia-durum"].textContent === "Creator Punch kendi altyazınla oynuyor. Beğendiğin karta dokun; seçtiğin stil kalır.");
    ok("ızgara dinleyicisi kabarcık evresinde (kartın işleyicisinden sonra)", /grid\.addEventListener\("click", stilIzgarasiTiklandi\);/.test(obSrc));
    s1.ogeler["cap-stil-grid"]._olay.click[0]({ target: s1.ogeler["cap-stil-grid"] });
    kartTikla(s1, ["stil-sec", "stil-mogrt", "locked"]);
    kartTikla(s1, ["stil-sec", "stil-motor"]);
    s1.ogeler["cap-stil-grid"]._olay.click[0]();
    ok("Pro: ızgara boşluğu, kilitli kart ve seçime geçmeyen kart yedeği bırakmaz", !!s1.ayarlar.onboarding.stilYedek);
    kartTikla(s1, ["stil-sec", "stil-motor", "secili"]);
    ok("Pro kullanıcı kilitsiz bir kartı seçince yedek bırakılır (kayıttan da)", s1.ayarlar.onboarding.stilYedek === undefined);
    s1.ogeler["ia-stil-koy"]._olay.click[0]();
    ok("'Timeline'a koy' kullanıcının seçtiği stili uygular (Creator Punch'a dönmez)", J(s1.say.stilDene) === J(["mrbeast"]) && s1.say.styled === 1 && s1.say.stilGeri === 0);
    var s2 = sahte({ ayarVardi: false, pro: true, segments: true, model: true, stilSecili: true });
    s2.OB.init();
    s2.ogeler["ia-stil-koy"]._olay.click[0]();
    ok("kayıtlı stili olan Pro kullanıcı önizlemesiz 'Timeline'a koy' → kendi stili", s2.say.stilDene.length === 0 && s2.say.styled === 1);
    var s3 = sahte({ ayarVardi: false, pro: true, segments: true, model: true });
    s3.OB.init();
    s3.ogeler["ia-stil-koy"]._olay.click[0]();
    ok("hiç stil seçili değilse Creator Punch önizlenip konur", J(s3.say.stilDene) === J(["mrbeast"]) && s3.say.styled === 1 && s3.ayarlar.onboarding.stilYedek === undefined);
    var s4 = sahte({ ayarVardi: false, segments: true, model: true });
    s4.OB.init();
    s4.ogeler["ia-stil-goster"]._olay.click[0]();
    s4.ogeler["cap-maxlen"]._olay.change[0]();
    s4.ogeler["ia-stil-tamam"]._olay.click[0]();
    ok("ücretsiz: satır uzunluğunu elle değiştirenin seçimi 'Tamam'da geri alınmaz", s4.say.stilGeri === 0 && s4.ayarlar.onboarding.adimlar.stil === "tamam");
    var s4b = sahte({ ayarVardi: false, segments: true, model: true, pro: true });
    s4b.OB.init();
    s4b.ogeler["ia-stil-goster"]._olay.click[0]();
    s4b.ogeler["cap-boyut"]._olay.input[0]();
    s4b.ogeler["ia-stil-tamam"]._olay.click[0]();
    ok("Pro: görünüm ayarını elle değiştirenin seçimi 'Tamam'da geri alınmaz", s4b.say.stilGeri === 0);
    /* İnceleme bulgusu: ücretsiz kullanıcı ipucuna uyup kartlara dokununca önizleme kalıcı seçime dönüyordu */
    var s4c = sahte({ ayarVardi: false, segments: true, model: true });
    s4c.OB.init();
    s4c.ogeler["ia-stil-goster"]._olay.click[0]();
    ok("ücretsiz ipucu: kartlar önizleme, 'Tamam' önceki görünümü geri getirir", s4c.ogeler["ia-durum"].textContent ===
      "Creator Punch kendi altyazınla oynuyor. Diğer kartlara dokunarak da önizleyebilirsin; \"Tamam\" deyince önceki görünümün geri gelir.");
    kartTikla(s4c, ["stil-sec", "stil-motor", "secili"]);
    kartTikla(s4c, ["stil-sec", "stil-motor", "secili"]);
    s4c.ogeler["cap-boyut"]._olay.change[0]();
    s4c.ogeler["cap-renk"]._olay.input[0]();
    ok("ücretsiz: kart dokunuşları ve yalnız animasyonlu katmanı etkileyen ayarlar yedeği bırakmaz", !!s4c.ayarlar.onboarding.stilYedek);
    var s4d = sahte({ ayarVardi: true, segments: true, model: true, ayarlar: s4c.ayarlar });   // panel bu arada kapandı
    s4d.OB.init();
    ok("ücretsiz: kartlara dokunduktan sonra panel kapandıysa açılışta önceki görünüm geri gelir", s4d.say.stilGeri === 1 && s4d.ayarlar.onboarding.stilYedek === undefined);
    s4c.ogeler["ia-stil-tamam"]._olay.click[0]();
    ok("ücretsiz: kartlara dokunup 'Tamam' diyende önceki görünüm geri gelir", s4c.say.stilGeri === 1 && s4c.ayarlar.onboarding.stilYedek === undefined &&
      s4c.ayarlar.onboarding.adimlar.stil === "tamam");
    var s4e = sahte({ ayarVardi: false, segments: true, model: true });
    s4e.OB.init();
    s4e.ogeler["ia-stil-bas"]._olay.click[0]();   // stil adımı başlığından açıldı: "Atla" onu atlar
    s4e.ogeler["ia-stil-goster"]._olay.click[0]();
    kartTikla(s4e, ["stil-sec", "stil-motor", "secili"]);
    s4e.ogeler["ilk-adim-atla"]._olay.click[0]();
    var s4f = sahte({ ayarVardi: false, segments: true, model: true });
    s4f.OB.init();
    s4f.ogeler["ia-stil-goster"]._olay.click[0]();
    kartTikla(s4f, ["stil-sec", "stil-mogrt", "locked"]);
    s4f.ogeler["ilk-adim-kapat"]._olay.click[0]();
    ok("ücretsiz: karta dokunduktan sonra 'Atla' ya da rehberi kapatmak da geri getirir", s4e.say.stilGeri === 1 && s4e.ayarlar.onboarding.adimlar.stil === "atlandi" &&
      s4f.say.stilGeri === 1 && s4f.ayarlar.onboarding.kapandi === true);
    var s5 = sahte({ ayarVardi: false, segments: true, model: true });
    s5.OB.init();
    s5.ogeler["ia-stil-goster"]._olay.click[0]();
    s5.ogeler["ia-stil-tamam"]._olay.click[0]();
    ok("yalnız önizleyip 'Tamam' diyende önceki görünüm geri gelir", s5.say.stilGeri === 1 && s5.ayarlar.onboarding.stilYedek === undefined);
    var s6 = sahte({ ayarVardi: false, segments: true, model: true });
    s6.OB.init();
    s6.ogeler["ia-stil-goster"]._olay.click[0]();
    var s6b = sahte({ ayarVardi: true, segments: true, model: true, ayarlar: s6.ayarlar });   // panel deneme sürerken kapandı
    s6b.OB.init();
    ok("deneme sürerken panel kapandıysa sonraki açılışta önceki görünüm geri konur", s6b.say.stilGeri === 1 && s6b.ayarlar.onboarding.stilYedek === undefined && s6b.say.call === 0);

    /* ---- yerel motor yokken anahtar: ses Groq'a gider uyarısı her yoldan ---- */
    var o1 = sahte({ ayarVardi: false, bulut: true });
    o1.OB.init();
    o1.OB.anahtarIste("", "rehber");
    ok("yerel motor yokken AI adımından anahtar: 'sesin Groq'a gider' satırı görünür", o1.ogeler["onb-anahtar-onay"].hidden === false);
    o1.OB.anahtarIste("AI metin kontrolü", "cip");
    ok("AI çipinden gelince de görünür", o1.ogeler["onb-anahtar-onay"].hidden === false);
    ok("sihirbazın alt notu 'ses gönderilmez' demez", !/ses gönderilmez/.test(html.slice(html.indexOf('id="onb-anahtar"'), html.indexOf("</div>", html.indexOf('class="hint onb-gizlilik"')))));

    /* ================= 9) index.html / app.js bağlantıları ================= */
    var appSrc = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8");
    ok("app.js: rehber guvenli('Onboarding') ile başlar", /guvenli\("Onboarding", function \(\) \{ if \(window\.KOnboarding\) KOnboarding\.init\(\); \}\)/.test(appSrc));
    ok("app.js: rehber tam kartken yenilikler penceresi açılmaz", /if \(rehber !== "tam"\) yenilikleriGoster\(\)/.test(appSrc));
    var sira = ["js/captions.js", "js/onboarding-steps.js", "js/onboarding.js", "js/app.js"].map(function (f) { return html.indexOf('<script src="' + f + '"'); });
    ok("betik sırası: captions → onboarding-steps → onboarding → app", sira.every(function (x, i) { return x > 0 && (i === 0 || x > sira[i - 1]); }), J(sira));
    ok("kart Altyazı sekmesinin en üstünde, kurulum notundan önce", html.indexOf('id="ilk-adim"') > html.indexOf('id="tab-captions"') && html.indexOf('id="ilk-adim"') < html.indexOf('id="cap-setup"'));
    ok("Ayarlar > Destek'te 'Kurulum rehberini aç'", /<button id="set-onb-ac"[^>]*>Kurulum rehberini aç<\/button>/.test(html));
  });
}).then(function () {
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}).catch(function (e) {
  console.log("FAIL beklenmeyen hata: " + (e && e.stack || e));
  process.exit(1);
});
