#!/usr/bin/env node
/*
 * Suflo — yerel motor kıyası (3.2 adım 5): Hızlı / En doğru (ve isteğe bağlı DTW) için gerçek zaman
 * çarpanı ve kelime hata oranı (WER). Varsayılan çözme modu bu kıyasın sonucuna göre seçilir
 * (js/whisper-args.js VARSAYILAN_COZME; kıyas yapılana dek "dogru").
 *
 *   node tools/motor-kiyas.js --cli <whisper-cli> --modeller <models klasörü> --ornekler <klasör>
 *        [--model turbo,large] [--mod dogru,hizli] [--dtw] [--vad <ggml-silero-v5.1.2.bin>]
 *        [--dil tr] [--threads 8] [--tekrar 1] [--json sonuc.json]
 *
 * --ornekler klasöründe her örnek için <ad>.wav (16 kHz mono PCM; dönüştürmek için:
 * ffmpeg -i girdi -ar 16000 -ac 1 -c:a pcm_s16le <ad>.wav) ve elle düzeltilmiş referans metni <ad>.txt.
 * Önerilen üç örnek: studyo, telefon, gurultulu (1–3 dk Türkçe konuşma).
 *
 * Argümanlar panelle aynı kaynaktan kurulur (js/whisper-args.js olustur): kıyas panelin gerçekte
 * çalıştırdığı bayrakları ölçer. Metin -ojf JSON'undan js/whisper-words.js ile okunur. WER Türkçe
 * normalizasyondan sonra kelime düzeyinde Levenshtein / referans kelime sayısı (noktalama, büyük-küçük
 * harf ve kesme işareti yok sayılır; "3" ile "üç" farklı sayılır). Gerçek zaman çarpanı = ses süresi /
 * geçen süre (büyük = hızlı); model yükleme süresi dahil (panelde de her iş modeli yeniden yükler).
 *
 * Saf işlevler (normalize, wer, wavSure, argumanlar, tablo) Node testlerinde doğrudan çalışır
 * (tests/test-motor-kiyas.js); whisper-cli yalnız komut satırından çağrılınca çalışır.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var KOK = path.resolve(__dirname, "..");
var WAR = require(path.join(KOK, "js", "whisper-args.js"));
var WW = require(path.join(KOK, "js", "whisper-words.js"));

var MODEL_DOSYA = {
  tiny: "ggml-tiny-q5_1.bin", base: "ggml-base-q5_1.bin", small: "ggml-small-q5_1.bin",
  turbo: "ggml-large-v3-turbo-q5_0.bin", large: "ggml-large-v3-q5_0.bin"
};

// Türkçe büyük-küçük harf (I → ı, İ → i), noktalama ve kesme işareti atılır, boşluk tekilleşir
function normalize(metin) {
  var s = String(metin == null ? "" : metin).replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
  s = s.replace(/['’‘`´]/g, "");
  s = s.replace(/[^0-9a-zçğıöşüâîûäëïößàèéêìòùáíóúñ\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

function kelimeler(metin) { var n = normalize(metin); return n ? n.split(" ") : []; }

/*
 * Kelime hata oranı: (yer değiştirme + silme + ekleme) / referans kelime sayısı.
 * Döner: { wer, yer, sil, ekle, n } (referans boşsa wer = hipotez boşsa 0, değilse 1)
 */
function wer(referans, hipotez) {
  var r = kelimeler(referans), h = kelimeler(hipotez);
  var n = r.length, m = h.length;
  if (!n) return { wer: m ? 1 : 0, yer: 0, sil: 0, ekle: m, n: 0 };
  // d[i][j] = { maliyet, yer, sil, ekle } — iki satırlık dinamik programlama
  var onceki = [], i, j;
  for (j = 0; j <= m; j++) onceki.push({ c: j, y: 0, s: 0, e: j });
  for (i = 1; i <= n; i++) {
    var simdi = [{ c: i, y: 0, s: i, e: 0 }];
    for (j = 1; j <= m; j++) {
      var esit = r[i - 1] === h[j - 1];
      var a = onceki[j - 1], b = onceki[j], c = simdi[j - 1];
      var sec;
      var degis = a.c + (esit ? 0 : 1), silme = b.c + 1, ekleme = c.c + 1;
      if (degis <= silme && degis <= ekleme) sec = { c: degis, y: a.y + (esit ? 0 : 1), s: a.s, e: a.e };
      else if (silme <= ekleme) sec = { c: silme, y: b.y, s: b.s + 1, e: b.e };
      else sec = { c: ekleme, y: c.y, s: c.s, e: c.e + 1 };
      simdi.push(sec);
    }
    onceki = simdi;
  }
  var son = onceki[m];
  return { wer: son.c / n, yer: son.y, sil: son.s, ekle: son.e, n: n };
}

// WAV süresi (sn): "data" bloğu boyutu / bayt hızı (başlık 44 bayt değilse de doğru)
function wavSure(buf) {
  if (!buf || buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return 0;
  var bytHizi = 0, ofs = 12;
  while (ofs + 8 <= buf.length) {
    var ad = buf.toString("ascii", ofs, ofs + 4), boy = buf.readUInt32LE(ofs + 4);
    if (ad === "fmt ") bytHizi = buf.readUInt32LE(ofs + 16);
    if (ad === "data") return bytHizi > 0 ? Math.min(boy, buf.length - ofs - 8) / bytHizi : 0;
    ofs += 8 + boy + (boy % 2);
  }
  return 0;
}

function argumanlar(argv) {
  var o = { cli: "", modeller: "", ornekler: "", model: ["turbo", "large"], mod: ["dogru", "hizli"], dtw: false, vad: "", dil: "tr", threads: 0, tekrar: 1, json: "" };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i], v = argv[i + 1];
    if (a === "--dtw") { o.dtw = true; continue; }
    if (!/^--/.test(a) || v === undefined) continue;
    var ad = a.slice(2);
    if (ad === "model" || ad === "mod") o[ad] = String(v).split(",").map(function (x) { return x.trim(); }).filter(Boolean);
    else if (ad === "threads" || ad === "tekrar") o[ad] = Math.max(0, parseInt(v, 10) || 0);
    else if (Object.prototype.hasOwnProperty.call(o, ad)) o[ad] = String(v);
    i++;
  }
  o.mod = o.mod.map(WAR.cozmeModu).filter(function (x, k, d) { return d.indexOf(x) === k; });
  o.model = o.model.filter(function (x) { return Object.prototype.hasOwnProperty.call(MODEL_DOSYA, x); });
  if (!o.tekrar) o.tekrar = 1;
  return o;
}

function yuzde(x) { return (Math.round(x * 1000) / 10).toFixed(1) + "%"; }

// Markdown tablosu: model, mod, DTW, örnek, süre, gerçek zaman çarpanı, WER; sonra model + mod ortalaması
function tablo(sonuclar) {
  var satir = ["| Model | Çözme | DTW | Örnek | Ses (sn) | Süre (sn) | Gerçek zaman | WER |", "|---|---|---|---|---:|---:|---:|---:|"];
  sonuclar.forEach(function (s) {
    satir.push("| " + [s.model, s.mod, s.dtw ? "açık" : "kapalı", s.ornek, s.sesSn.toFixed(1), s.sureSn.toFixed(1),
      (s.sesSn / Math.max(s.sureSn, 1e-6)).toFixed(2) + "×", s.hata ? "hata" : yuzde(s.wer)].join(" | ") + " |");
  });
  var grup = {};
  sonuclar.forEach(function (s) {
    if (s.hata) return;
    var k = s.model + " · " + s.mod + (s.dtw ? " · DTW" : "");
    if (!grup[k]) grup[k] = { ses: 0, sure: 0, hata: 0, n: 0 };
    grup[k].ses += s.sesSn; grup[k].sure += s.sureSn; grup[k].hata += s.wer * s.refKelime; grup[k].n += s.refKelime;
  });
  satir.push("", "| Toplam | Gerçek zaman | WER (kelime ağırlıklı) |", "|---|---:|---:|");
  Object.keys(grup).forEach(function (k) {
    var g = grup[k];
    satir.push("| " + k + " | " + (g.ses / Math.max(g.sure, 1e-6)).toFixed(2) + "× | " + yuzde(g.n ? g.hata / g.n : 0) + " |");
  });
  return satir.join("\n");
}

function kos(o) {
  var ornekler = fs.readdirSync(o.ornekler).filter(function (f) { return /\.wav$/i.test(f); }).sort();
  if (!ornekler.length) throw new Error("örnek yok: " + o.ornekler + " (<ad>.wav + <ad>.txt)");
  var gecici = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-kiyas-"));
  var threads = o.threads || Math.max(2, Math.min(8, os.cpus().length - 2));
  var sonuclar = [];
  o.model.forEach(function (modelId) {
    var modelYolu = path.join(o.modeller, MODEL_DOSYA[modelId]);
    if (!fs.existsSync(modelYolu)) { console.error("model yok, atlandı: " + modelYolu); return; }
    o.mod.forEach(function (mod) {
      (o.dtw ? [false, true] : [false]).forEach(function (dtw) {
        ornekler.forEach(function (wav) {
          var ad = wav.replace(/\.wav$/i, "");
          var refYol = path.join(o.ornekler, ad + ".txt");
          if (!fs.existsSync(refYol)) { console.error("referans yok, atlandı: " + refYol); return; }
          var ref = fs.readFileSync(refYol, "utf8");
          var sesSn = wavSure(fs.readFileSync(path.join(o.ornekler, wav)));
          for (var t = 0; t < o.tekrar; t++) {
            var outBase = path.join(gecici, ad + "_" + modelId + "_" + mod + (dtw ? "_dtw" : "") + "_" + t);
            var args = WAR.olustur({ model: modelYolu, audio: path.join(o.ornekler, wav), outBase: outBase, lang: o.dil, threads: threads,
              cozme: mod, dtw: dtw, modelId: modelId, vad: o.vad || null });
            var bas = Date.now();
            var r = cp.spawnSync(o.cli, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
            var sureSn = (Date.now() - bas) / 1000;
            var kayit = { model: modelId, mod: mod, dtw: dtw, ornek: ad, tekrar: t, sesSn: sesSn, sureSn: sureSn, refKelime: kelimeler(ref).length, args: args.join(" ") };
            try {
              var bilgi = {};
              var segs = WW.segmentleriCoz(fs.readFileSync(outBase + ".json"), bilgi, { stderr: r.stderr, vadAcik: !!o.vad });
              var hip = segs.map(function (s) { return s.text; }).join(" ");
              var w = wer(ref, hip);
              kayit.wer = w.wer; kayit.ayrinti = w; kayit.dtwOlculen = bilgi.dtw ? bilgi.dtw.olculen : 0; kayit.dtwToplam = bilgi.dtw ? bilgi.dtw.toplam : 0;
              try { fs.unlinkSync(outBase + ".json"); } catch (e0) {}
            } catch (e) {
              kayit.hata = (WAR.bilinmeyenBayrak(r.stderr) ? "tanınmayan bayrak " + WAR.bilinmeyenBayrak(r.stderr) : String(e && e.message || e)) + " (kod " + r.status + ")";
            }
            sonuclar.push(kayit);
            console.error(modelId + " · " + mod + (dtw ? " · DTW" : "") + " · " + ad + ": " + sureSn.toFixed(1) + " sn" + (kayit.hata ? " · " + kayit.hata : " · WER " + yuzde(kayit.wer)) +
              (dtw && !kayit.hata ? " · t_dtw " + kayit.dtwOlculen + "/" + kayit.dtwToplam : ""));
          }
        });
      });
    });
  });
  try { fs.rmdirSync(gecici); } catch (eR) {}
  return sonuclar;
}

if (require.main === module) {
  var o = argumanlar(process.argv.slice(2));
  if (!o.cli || !o.modeller || !o.ornekler) {
    console.error("kullanım: node tools/motor-kiyas.js --cli <whisper-cli> --modeller <klasör> --ornekler <klasör> [--model turbo,large] [--mod dogru,hizli] [--dtw] [--vad <silero>] [--json sonuc.json]");
    process.exit(2);
  }
  var sonuclar = kos(o);
  console.log(tablo(sonuclar));
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ tarih: new Date().toISOString(), secenek: o, sonuclar: sonuclar }, null, 2));
}

module.exports = { normalize: normalize, kelimeler: kelimeler, wer: wer, wavSure: wavSure, argumanlar: argumanlar, tablo: tablo, MODEL_DOSYA: MODEL_DOSYA };
