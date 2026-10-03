#!/usr/bin/env node
/*
 * Suflo — rehberin örnek klibi için hazır transkript (assets/onboarding/ornek-tr.words.json)
 *
 * whisper-cli'nin JSON çıktılarını (-oj) panelin beklediği biçime çevirir:
 *   { lang, kaynak, words:[{start,end,text}], segments:[{start,end,text}] }
 * Zamanlar klibe görelidir (sn). Çıktıyı ELLE kontrol et: yazım hatalarını düzelt,
 * zamanlara dokunma. Ayrıntılı adımlar: marketing/v4-kurucu-yapilacaklar.md
 *
 *   whisper-cli -m ggml-large-v3-turbo-q5_0.bin -f ornek-tr.wav -l tr -oj -ml 1 -sow -of kelimeler
 *   whisper-cli -m ggml-large-v3-turbo-q5_0.bin -f ornek-tr.wav -l tr -oj -of satirlar
 *   node tools/ornek-transkript.js --kelime kelimeler.json --satir satirlar.json > assets/onboarding/ornek-tr.words.json
 */
var fs = require("fs");
var path = require("path");
var SO = require(path.join(__dirname, "..", "js", "onboarding-steps.js"));

function zaman(t, alan) {
  if (t.offsets && isFinite(Number(t.offsets[alan]))) return Number(t.offsets[alan]) / 1000;
  var s = t.timestamps && t.timestamps[alan];
  var m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(String(s || ""));
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + parseFloat("0." + m[4]) : NaN;
}

function liste(json) {
  return ((json && json.transcription) || []).map(function (t) {
    return { start: Math.round(zaman(t, "from") * 1000) / 1000, end: Math.round(zaman(t, "to") * 1000) / 1000, text: String(t.text || "").trim() };
  }).filter(function (x) {
    // yalnız noktalamadan oluşan belirteçler kelime değil
    return isFinite(x.start) && isFinite(x.end) && x.text.replace(/[.,!?;:…"'«»-]/g, "").trim();
  });
}

function donustur(kelimeJson, satirJson, lang) {
  var dil = lang || (kelimeJson && kelimeJson.result && kelimeJson.result.language) || "tr";
  var dilKodu = { turkish: "tr", english: "en", azerbaijani: "az" }[String(dil).toLowerCase()] || String(dil).slice(0, 2).toLowerCase();
  var ham = { lang: dilKodu, words: liste(kelimeJson), segments: satirJson ? liste(satirJson) : [] };
  var temiz = SO.ornekKelimeleri(ham);   // panelin okuyacağı biçimle aynı denetim
  return { lang: temiz.lang, kaynak: "whisper.cpp large-v3-turbo, elle kontrol edildi", words: temiz.words, segments: temiz.segments };
}

if (require.main === module) {
  var arg = process.argv.slice(2), o = {};
  for (var i = 0; i < arg.length; i += 2) o[String(arg[i]).replace(/^--/, "")] = arg[i + 1];
  if (!o.kelime) {
    console.error("Kullanım: node tools/ornek-transkript.js --kelime kelimeler.json [--satir satirlar.json] [--lang tr]");
    process.exit(1);
  }
  var kj = JSON.parse(fs.readFileSync(o.kelime, "utf8"));
  var sj = o.satir ? JSON.parse(fs.readFileSync(o.satir, "utf8")) : null;
  var sonuc = donustur(kj, sj, o.lang);
  if (sonuc.words.length < 8) { console.error("Çok az kelime (" + sonuc.words.length + "): -ml 1 -sow ile mi çalıştırdın?"); process.exit(1); }
  console.error(sonuc.words.length + " kelime, " + sonuc.segments.length + " satır · dil " + sonuc.lang + " · şimdi ELLE kontrol et");
  process.stdout.write(JSON.stringify(sonuc, null, 1) + "\n");
}

module.exports = { donustur: donustur };
