// Suflo testi: tools/motor-kiyas.js (3.2 adım 5) — Hızlı / En doğru kıyasının saf işlevleri:
// Türkçe normalizasyon, kelime hata oranı (WER), WAV süresi, komut satırı ve tablo; model dosya adları
// js/engine.js kataloğuyla aynı; argümanlar panelle aynı kaynaktan (js/whisper-args.js)
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var M = require(path.join(KOK, "tools", "motor-kiyas.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function yakin(a, b) { return Math.abs(a - b) < 1e-9; }

/* ---------------- normalizasyon ---------------- */
ok("Türkçe büyük harf: I -> ı, İ -> i", M.normalize("IŞIK İSTANBUL") === "ışık istanbul", M.normalize("IŞIK İSTANBUL"));
ok("noktalama ve kesme işareti atılır", M.normalize("Suflo'nun, değil mi?  Evet!") === "suflonun değil mi evet", M.normalize("Suflo'nun, değil mi?  Evet!"));
ok("rakam korunur, tire boşluk olur", M.normalize("3 kişi — e-posta") === "3 kişi e posta", M.normalize("3 kişi — e-posta"));
ok("boş / null", M.normalize(null) === "" && M.kelimeler("  ").length === 0);

/* ---------------- WER ---------------- */
var w0 = M.wer("Bu ışık hiç de kötü değil.", "bu ışık hiç de kötü değil");
ok("aynı metin (noktalama, büyük harf hariç) WER 0", w0.wer === 0 && w0.n === 6, JSON.stringify(w0));
var w1 = M.wer("bu ışık hiç de kötü değil", "bu ışık hiç kötü değil mi");
ok("1 silme + 1 ekleme: 2/6", yakin(w1.wer, 2 / 6) && w1.sil === 1 && w1.ekle === 1 && w1.yer === 0, JSON.stringify(w1));
var w2 = M.wer("kamerayı biraz sola çevirelim", "kamerayı biraz sağa çevirelim");
ok("1 yer değiştirme: 1/4", yakin(w2.wer, 0.25) && w2.yer === 1, JSON.stringify(w2));
ok("boş hipotez: WER 1 (hepsi silme)", M.wer("bir iki üç", "").wer === 1 && M.wer("bir iki üç", "").sil === 3);
ok("boş referans: hipotez boşsa 0, değilse 1", M.wer("", "").wer === 0 && M.wer("", "fazla").wer === 1);
ok("WER 1'i aşabilir (çok ekleme)", M.wer("tek", "çok fazla uydurma kelime").wer > 1);

/* ---------------- WAV süresi ---------------- */
function wav(sn, oran, kanal, ekBlok) {
  var bayt = Math.round(sn * oran) * kanal * 2;
  var ek = ekBlok ? Buffer.concat([Buffer.from("LIST"), Buffer.from([4, 0, 0, 0]), Buffer.from("INFO")]) : Buffer.alloc(0);
  var b = Buffer.alloc(44 + ek.length + bayt);
  b.write("RIFF", 0); b.writeUInt32LE(36 + ek.length + bayt, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(kanal, 22);
  b.writeUInt32LE(oran, 24); b.writeUInt32LE(oran * kanal * 2, 28); b.writeUInt16LE(kanal * 2, 32); b.writeUInt16LE(16, 34);
  ek.copy(b, 36);
  b.write("data", 36 + ek.length); b.writeUInt32LE(bayt, 40 + ek.length);
  return b;
}
ok("WAV süresi: 16 kHz mono 2,5 sn", yakin(M.wavSure(wav(2.5, 16000, 1)), 2.5));
ok("WAV süresi: data öncesi LIST bloğu olsa da", yakin(M.wavSure(wav(1, 16000, 1, true)), 1));
ok("WAV süresi: 48 kHz stereo", yakin(M.wavSure(wav(2, 48000, 2)), 2));
ok("WAV değil / kısa: 0", M.wavSure(Buffer.from("not a wav file at all, nope, really not")) === 0 && M.wavSure(null) === 0);

/* ---------------- komut satırı ---------------- */
var a = M.argumanlar(["--cli", "C:\\w\\whisper-cli.exe", "--modeller", "C:\\w\\models", "--ornekler", "D:\\kiyas", "--model", "turbo, large,medium",
  "--mod", "hizli,dogru,HIZLI,turbo", "--dtw", "--threads", "8", "--json", "s.json"]);
ok("argümanlar: yollar, model (bilinmeyen atlanır), mod (tekil, bilinmeyen -> dogru), dtw, threads, json",
  a.cli === "C:\\w\\whisper-cli.exe" && a.modeller === "C:\\w\\models" && a.ornekler === "D:\\kiyas" &&
  JSON.stringify(a.model) === JSON.stringify(["turbo", "large"]) && JSON.stringify(a.mod) === JSON.stringify(["hizli", "dogru"]) &&
  a.dtw === true && a.threads === 8 && a.json === "s.json" && a.dil === "tr" && a.tekrar === 1, JSON.stringify(a));
var v = M.argumanlar([]);
ok("varsayılanlar: turbo + large, dogru + hizli, DTW kapalı", JSON.stringify(v.model) === JSON.stringify(["turbo", "large"]) && JSON.stringify(v.mod) === JSON.stringify(["dogru", "hizli"]) && v.dtw === false);

/* ---------------- tablo ---------------- */
var t = M.tablo([
  { model: "turbo", mod: "dogru", dtw: false, ornek: "studyo", sesSn: 60, sureSn: 20, wer: 0.05, refKelime: 100 },
  { model: "turbo", mod: "dogru", dtw: false, ornek: "telefon", sesSn: 60, sureSn: 40, wer: 0.15, refKelime: 300 },
  { model: "turbo", mod: "hizli", dtw: false, ornek: "studyo", sesSn: 60, sureSn: 5, wer: 0.06, refKelime: 100 },
  { model: "turbo", mod: "hizli", dtw: true, ornek: "studyo", sesSn: 60, sureSn: 6, hata: "tanınmayan bayrak -nfa", refKelime: 100 }
]);
ok("tablo: satır başına gerçek zaman çarpanı ve WER, hata satırı", /\| turbo \| dogru \| kapalı \| studyo \| 60\.0 \| 20\.0 \| 3\.00× \| 5\.0% \|/.test(t) && /\| hata \|/.test(t), t);
ok("tablo: model + mod toplamı (ses / süre, kelime ağırlıklı WER)", /\| turbo · dogru \| 2\.00× \| 12\.5% \|/.test(t) && /\| turbo · hizli \| 12\.00× \| 6\.0% \|/.test(t) && !/turbo · hizli · DTW/.test(t), t);

/* ---------------- ASCII-güvenli yol (issue #7; inceleme bulgusu) ---------------- */
var TR_MODEL = "C:\\Users\\Şükrü\\AppData\\Roaming\\Kesit\\whisper\\models\\ggml-large-v3-turbo-q5_0.bin";
var TR_WAV = "D:\\kıyas\\stüdyo.wav", TR_VAD = "C:\\Users\\Şükrü\\AppData\\Roaming\\Kesit\\whisper\\models\\ggml-silero-v5.1.2.bin";
var TR_TMP = "C:\\Users\\Şükrü\\AppData\\Local\\Temp\\suflo-kiyas-ab12", TR_OUT = TR_TMP + "\\o0_st_dyo_turbo_dogru_0";
var KISA = {};
KISA[TR_MODEL] = "C:\\Users\\SKR~1\\AppData\\Roaming\\Kesit\\whisper\\models\\GGML-L~1.BIN";
KISA[TR_VAD] = "C:\\Users\\SKR~1\\AppData\\Roaming\\Kesit\\whisper\\models\\GGML-S~1.BIN";
KISA[TR_WAV] = "D:\\KIYAS~1\\STDYO~1.WAV";
KISA[TR_TMP] = "C:\\Users\\SKR~1\\AppData\\Local\\Temp\\SUFLO-~1";
var komutlar = [];
function sahteFs(varolan) {
  var kopyalar = [];
  return {
    kopyalar: kopyalar,
    existsSync: function (p) { return varolan.indexOf(p) !== -1 || kopyalar.indexOf(p) !== -1; },
    mkdirSync: function () {}, statSync: function () { return { size: 1234 }; },
    copyFileSync: function (a, b) { kopyalar.push(b); }
  };
}
var ex83 = function (komut) {
  komutlar.push(komut);
  var m = /^for %I in \("(.*)"\) do @echo %~sI$/.exec(komut);
  if (m && KISA[m[1]]) return Buffer.from("\r\n" + KISA[m[1]] + "\r\n");
  throw new Error("8.3 yok");
};
var var83 = Object.keys(KISA).map(function (k) { return KISA[k]; }).concat([TR_MODEL, TR_WAV, TR_VAD, TR_TMP]);
var y83 = M.guvenliYolKancasi({ platform: "win32", execSync: ex83, fs: sahteFs(var83) });
ok("Windows, Türkçe karakterli kullanıcı yolu: model / ses / VAD 8.3 kısa yoluna çevrilir",
  y83(TR_MODEL, "girdi") === KISA[TR_MODEL] && y83(TR_WAV, "girdi") === KISA[TR_WAV] && y83(TR_VAD, "girdi") === KISA[TR_VAD], komutlar.join(" | "));
ok("çıktı tabanı: yalnız klasör kısalır, ASCII ad korunur (JSON aynı fiziksel klasöre düşer)", y83(TR_OUT, "cikti") === KISA[TR_TMP] + "\\o0_st_dyo_turbo_dogru_0");
ok("ASCII yol ve Windows dışı: dokunulmaz", y83("D:\\kiyas\\a.wav", "girdi") === "D:\\kiyas\\a.wav" &&
  M.guvenliYolKancasi({ platform: "linux", execSync: function () { throw new Error("çağrılmamalı"); } })("/home/şükrü/a.wav", "girdi") === "/home/şükrü/a.wav");
var fsKopya = sahteFs([TR_WAV]);
var yKopya = M.guvenliYolKancasi({ platform: "win32", execSync: function () { throw new Error("8.3 kapalı"); }, fs: fsKopya, kopyaDir: "C:\\ProgramData\\Suflo\\ascii-onbellek" });
ok("8.3 kısa ad kapalı: girdi ASCII önbellek klasörüne kopyalanır (panelle aynı klasör ve ad biçimi)",
  yKopya(TR_WAV, "girdi") === "C:\\ProgramData\\Suflo\\ascii-onbellek\\1234-st_dyo.wav" && fsKopya.kopyalar.length === 1, fsKopya.kopyalar.join(","));
var ka = M.kosuArgumanlari({ model: TR_MODEL, audio: TR_WAV, outBase: TR_OUT, dil: "tr", threads: 8, mod: "hizli", dtw: true, modelId: "turbo", vad: TR_VAD }, y83);
function argOf(a, b) { var i = a.indexOf(b); return i < 0 ? undefined : a[i + 1]; }
ok("kıyas argümanları: -m / -f / -of / -vm ASCII-güvenli, bayraklar panelle aynı", argOf(ka, "-m") === KISA[TR_MODEL] && argOf(ka, "-f") === KISA[TR_WAV] &&
  argOf(ka, "-of") === KISA[TR_TMP] + "\\o0_st_dyo_turbo_dogru_0" && argOf(ka, "-vm") === KISA[TR_VAD] && argOf(ka, "-bs") === "1" && argOf(ka, "-dtw") === "large.v3.turbo" &&
  ka.every(function (x) { return M.asciiMi(x); }), ka.join(" "));
var kaynakK = fs.readFileSync(path.join(KOK, "tools", "motor-kiyas.js"), "utf8");
ok("kos(): her koşu kancalı kosuArgumanlari ile; ASCII'ye çevrilemeyen yolda whisper-cli çalıştırılmaz, neden yazılır",
  /var yol = guvenliYolKancasi\(\);/.test(kaynakK) && /kosuArgumanlari\(\{[^}]*\}, yol\)/.test(kaynakK) &&
  /asciiDisi\.length \? \{ status: null, stderr: "" \} : cp\.spawnSync/.test(kaynakK) && /ASCII olmayan yol whisper-cli'ye gitti/.test(kaynakK));

/* ---------------- tutarlılık ---------------- */
var motor = fs.readFileSync(path.join(KOK, "js", "engine.js"), "utf8");
ok("model dosya adları js/engine.js kataloğuyla aynı", Object.keys(M.MODEL_DOSYA).every(function (id) {
  return new RegExp('id: "' + id + '",\\s*file: "' + M.MODEL_DOSYA[id].replace(/\./g, "\\.") + '"').test(motor);
}));
var kaynak = fs.readFileSync(path.join(KOK, "tools", "motor-kiyas.js"), "utf8");
ok("argümanlar panelle aynı kaynaktan (WAR.olustur), metin whisper-words'ten", /WAR\.olustur\(\{/.test(kaynak) && /WW\.segmentleriCoz\(/.test(kaynak));
ok("komut satırı yalnız doğrudan çalıştırılınca (require edilince whisper-cli çağrılmaz)", /if \(require\.main === module\)/.test(kaynak));

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
