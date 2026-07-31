var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * bridge.js icindeki GERCEK HATA_REHBERI + hataYardimi() kaynagini kesip calistirir.
 * En kritik sinav YANLIS POZITIF: masum bir hataya yanlis cozum onerisi eklenmemeli,
 * cunku kullaniciyi olmayan bir sorunu kovalamaya yollar.
 */
var fs = require("fs");
var src = fs.readFileSync(KOKYOL + "js/bridge.js", "utf8");

function kesBlok(bas, son) {
  var i = src.indexOf(bas);
  if (i === -1) throw new Error("bulunamadi: " + bas);
  var j = src.indexOf(son, i);
  if (j === -1) throw new Error("kapanis bulunamadi: " + bas);
  return src.slice(i, j + son.length);
}

var rehber = kesBlok("var HATA_REHBERI", "\n  ];");
var fn = kesBlok("function hataYardimi(", "\n  }");

function kur(mac) {
  var kod = "var MAC = " + (mac ? "true" : "false") + ";\n" + rehber + "\n" + fn +
    "\n; return { hataYardimi: hataYardimi, HATA_REHBERI: HATA_REHBERI };";
  return new Function(kod)();
}

var win = kur(false);
var mac = kur(true);

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit ? "   [" + String(kanit).slice(0, 90) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

function coz(m, ortam) {
  return (ortam || win).hataYardimi(new Error(m));
}
function oneriVar(m, ortam) { return coz(m, ortam).indexOf("Çözüm:") !== -1; }

/* ---------- 1) YANLIS POZITIF: bu mesajlar ASLA oneri almamali ---------- */

var masum = [
  "Konuşma bulunamadı.",
  "Kesilecek aralik yok.",
  "Aktif sequence yok. Once bir sequence ac.",
  "Timeline'da bir klip sec.",
  "En az 2 keyframe gerekli.",
  "En az bir ses katmanı seç.",
  "Dosyada altyazı bulunamadı.",
  "Bu ozellik keyframe desteklemiyor.",
  "Hiçbir klipten konuşma alınamadı.",
  "Bilesen bulunamadi."
];
masum.forEach(function (m) {
  ok("masum mesaj oneri ALMIYOR: " + m.slice(0, 34), !oneriVar(m), coz(m).slice(0, 60));
});

/* sayi iceren ama alakasiz mesajlar 401/429 kuralina takilmamali */
ok("ses uzunlugu mesaji 429'a takilmiyor",
  !oneriVar("Ses çok uzun (429 MB). Yerel motoru kullan ya da parça parça al."),
  coz("Ses çok uzun (429 MB)."));
ok("401 satir sayisi metni yanlis eslesmiyor",
  !oneriVar("401 altyazı satırı hazır"),
  coz("401 altyazı satırı hazır"));
ok("bit hizi 401k yanlis eslesmiyor",
  !oneriVar("Ses hazırlanamadı: bitrate 401kbps desteklenmiyor"),
  coz("Ses hazırlanamadı: bitrate 401kbps desteklenmiyor"));

/* ---------- 2) GERCEK POZITIF: bu mesajlar dogru oneriyi almali ---------- */

function iceriyor(m, parca, ortam) {
  var c = coz(m, ortam);
  return c.indexOf(parca) !== -1;
}

ok("eksik VC++ (0xC0000135 ondalik kodu) -> vc_redist",
  iceriyor("Yerel motor çıktı üretmedi (kod=3221225781): ", "vc_redist"),
  coz("Yerel motor çıktı üretmedi (kod=3221225781): "));

ok("VCRUNTIME adi gecince -> vc_redist",
  iceriyor("Error: VCRUNTIME140_1.dll bulunamadı", "vc_redist"),
  coz("Error: VCRUNTIME140_1.dll bulunamadı"));

ok("eski islemci (0xC000001D) -> Groq onerisi",
  iceriyor("Yerel motor çıktı üretmedi (kod=-1073741795): ", "Groq"),
  coz("Yerel motor çıktı üretmedi (kod=-1073741795): "));

ok("EPERM Windows'ta antivirus tavsiyesi",
  iceriyor("EPERM: operation not permitted, unlink 'whisper-cli.exe'", "Antivirüs"),
  coz("EPERM: operation not permitted, unlink 'whisper-cli.exe'"));

ok("EPERM mac'te Windows tavsiyesi VERMIYOR",
  !iceriyor("EPERM: operation not permitted", "Antivirüs", mac),
  coz("EPERM: operation not permitted", mac));

ok("EPERM mac'te macOS tavsiyesi veriyor",
  iceriyor("EPERM: operation not permitted", "Gizlilik ve Güvenlik", mac),
  coz("EPERM: operation not permitted", mac));

ok("ENOSPC -> disk mesaji",
  iceriyor("ENOSPC: no space left on device", "Diskte yer kalmamış"),
  coz("ENOSPC: no space left on device"));

ok("ENOTFOUND -> internet mesaji",
  iceriyor("Motor indirilemedi: getaddrinfo ENOTFOUND huggingface.co", "İnternet bağlantısında"),
  coz("Motor indirilemedi: getaddrinfo ENOTFOUND huggingface.co"));

/* apiError()'in GERCEK urettigi mesajlar (js/captions.js apiError) */
ok("gercek 401 mesaji -> Groq anahtar yonlendirmesi",
  iceriyor("API anahtarı geçersiz — Ayarlar'dan kontrol et.", "Groq"),
  coz("API anahtarı geçersiz — Ayarlar'dan kontrol et."));

ok("ham invalid_api_key -> anahtar mesaji",
  iceriyor("API 403: {\"error\":{\"code\":\"invalid_api_key\"}}", "anahtar"),
  coz("API 403: {\"error\":{\"code\":\"invalid_api_key\"}}"));

ok("ham rate_limit -> limit mesaji",
  iceriyor("API 429: {\"error\":{\"code\":\"rate_limit_exceeded\"}}", "sınırına"),
  coz("API 429: {\"error\":{\"code\":\"rate_limit_exceeded\"}}"));

ok("API 429 bicimi -> limit mesaji",
  iceriyor("API 429: too many requests", "sınırına"),
  coz("API 429: too many requests"));

/*
 * "zaman aşımı" ifadesini alti ayri kaynak uretiyor (HTTP, indirme, alt surec,
 * evalScript). Yalnizca evalScript kaynaklisi Premiere'e yonlendirmeli.
 */
ok("Premiere yanit vermedi -> Premiere mesgul mesaji",
  iceriyor("Premiere yanıt vermedi (KS_exportAudio) — işlem zaman aşımına uğradı.", "Premiere meşgul"),
  coz("Premiere yanıt vermedi (KS_exportAudio) — işlem zaman aşımına uğradı."));

ok("indirme zaman asimi Premiere'e YOLLAMIYOR",
  !iceriyor("Motor indirilemedi: indirme zaman aşımı", "Premiere meşgul"),
  coz("Motor indirilemedi: indirme zaman aşımı"));

ok("indirme zaman asimi -> internet mesaji",
  iceriyor("Motor indirilemedi: indirme zaman aşımı", "İnternet bağlantısında"),
  coz("Motor indirilemedi: indirme zaman aşımı"));

ok("HTTP istegi zaman asimi Premiere'e YOLLAMIYOR",
  !iceriyor("Bağlantı hatası: zaman aşımı", "Premiere meşgul"),
  coz("Bağlantı hatası: zaman aşımı"));

ok("motor sureci zaman asimi Premiere'e YOLLAMIYOR",
  !iceriyor("Yerel motor çıktı üretmedi (kod=-1): [zaman aşımı]", "Premiere meşgul"),
  coz("Yerel motor çıktı üretmedi (kod=-1): [zaman aşımı]"));

ok("motor sureci zaman asimi -> motor mesaji",
  iceriyor("Yerel motor çıktı üretmedi (kod=-1): [zaman aşımı]", "yeniden kur"),
  coz("Yerel motor çıktı üretmedi (kod=-1): [zaman aşımı]"));

ok("motor cikti uretmedi -> yeniden kur mesaji",
  iceriyor("Yerel motor çıktı üretmedi (kod=1): ggml assert", "yeniden kur"),
  coz("Yerel motor çıktı üretmedi (kod=1): ggml assert"));

/* ---------- 3) Bicim: orijinal mesaj korunuyor mu ---------- */

var uzun = "ENOSPC: no space left on device, write";
ok("orijinal mesaj kayboluyor mu (kaybolmamali)",
  coz(uzun).indexOf(uzun) === 0, coz(uzun).slice(0, 70));

ok("oneri ayri satirda",
  coz(uzun).indexOf("\nÇözüm: ") !== -1, JSON.stringify(coz(uzun).slice(35, 55)));

ok("string girdi de kabul ediliyor (Error olmayan)",
  win.hataYardimi("ENOSPC: no space left").indexOf("Çözüm:") !== -1,
  win.hataYardimi("ENOSPC: no space left"));

ok("bos girdi patlamiyor", win.hataYardimi(null) === "" && win.hataYardimi(undefined) === "",
  JSON.stringify([win.hataYardimi(null), win.hataYardimi(undefined)]));

/* ---------- 4) Sira: ozgul kural genel kurali golgelemiyor mu ---------- */

/*
 * "Yerel motor çıktı üretmedi (kod=3221225781)" hem VC++ kuralina hem de
 * "cikti uretmedi" kuralina uyuyor. VC++ once gelmeli: daha ozgul ve daha yararli.
 */
ok("VC++ kurali 'cikti uretmedi' kuralindan ONCE",
  iceriyor("Yerel motor çıktı üretmedi (kod=3221225781)", "vc_redist"),
  coz("Yerel motor çıktı üretmedi (kod=3221225781)"));

/* Her kural gercekten erisilebilir mi: hicbiri olu kural olmamali */
var ornekler = [
  "VCRUNTIME140.dll eksik",
  "illegal instruction",
  "EACCES: permission denied",
  "ENOSPC: no space left",
  "ECONNRESET",
  "invalid_api_key",
  "rate_limit exceeded",
  "Premiere yanıt vermedi (KS_getContext)",
  "Motor çalıştırılamadı: kod=1"
];
var kapsanan = {};
ornekler.forEach(function (m) {
  var c = win.hataYardimi(m);
  var i = c.indexOf("Çözüm: ");
  if (i !== -1) kapsanan[c.slice(i)] = 1;
});
ok("her kural en az bir ornekle tetiklenebiliyor",
  Object.keys(kapsanan).length === win.HATA_REHBERI.length,
  Object.keys(kapsanan).length + "/" + win.HATA_REHBERI.length + " kural tetiklendi");

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
process.exit(kaldi ? 1 : 0);
