// Suflo testi: js/youtube-indir.js — YouTube indirici saf modülü (3.3)
// URL doğrulama, -J özeti ve kalite çipleri, yt-dlp argümanları (kabuk yok), --progress-template satırları,
// SHA2-256SUMS ayrıştırma + doğrulama, varlık seçimi, hata sınıflandırma, çıktı/iptal dosyaları, Premiere
// dönüştürme kararı ve İngilizce arayüzde tüm metinlerin çevrilmesi. Örnek satırlar gerçek yt-dlp
// 2026.08.19 ve ffmpeg çıktısından alındı.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var Y = require(path.join(KOK, "js", "youtube-indir.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
var ID = "dQw4w9WgXcQ";

/* ---------------- 1) URL ---------------- */
var kabul = [
  ["https://www.youtube.com/watch?v=" + ID, false, false],
  ["https://youtube.com/watch?v=" + ID + "&t=42s", false, false],
  ["http://m.youtube.com/watch?v=" + ID, false, false],
  ["https://music.youtube.com/watch?v=" + ID + "&list=RDAMVM" + ID, true, false],
  ["https://www.youtube.com/watch?v=" + ID + "&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG&index=3", true, false],
  ["https://www.youtube.com/watch?app=desktop&v=" + ID, false, false],
  ["https://youtu.be/" + ID, false, false],
  ["https://youtu.be/" + ID + "?si=AbCdEf123&t=10", false, false],
  ["https://www.youtube.com/shorts/" + ID, false, true],
  ["https://m.youtube.com/shorts/" + ID + "?feature=share", false, true],
  // canlı yayın / yayın kaydı: YouTube'un Paylaş › Kopyala bağlantısı (yayın sürüyorsa -J'deki live_status engeller)
  ["https://www.youtube.com/live/" + ID + "?si=AbCdEf123", false, false],
  ["https://m.youtube.com/live/" + ID + "/", false, false],
  ["youtube.com/watch?v=" + ID, false, false],
  ["youtu.be/" + ID, false, false],
  ["HTTPS://WWW.YOUTUBE.COM/watch?v=" + ID, false, false],
  ["  <https://youtu.be/" + ID + ">.  ", false, false],
  ["\u200Bhttps://youtu.be/" + ID + "\uFEFF", false, false],
  ["Şuna bak: https://youtu.be/" + ID + " çok iyi", false, false],
  ["https://www.youtube.com/watch?v=" + ID + "#t=1m", false, false]
];
kabul.forEach(function (k) {
  var r = Y.urlCoz(k[0]);
  ok("URL kabul: " + JSON.stringify(k[0]).slice(0, 70), r.ok === true && r.id === ID && r.url === "https://www.youtube.com/watch?v=" + ID && r.listeVardi === k[1] && r.shorts === k[2], js(r));
});
ok("kanonik adres list= / t= / si= taşımaz (yalnız video indirilir)", Y.urlCoz("https://www.youtube.com/watch?v=" + ID + "&list=PL123&t=5").url.indexOf("list") === -1);
var red = [
  ["", "bos"], ["   ", "bos"], [null, "bos"],
  ["https://vimeo.com/123456", "baskaSite"], ["https://www.youtube.com.evil.com/watch?v=" + ID, "baskaSite"],
  ["https://evilyoutube.com/watch?v=" + ID, "baskaSite"], ["https://youtube.com@evil.com/watch?v=" + ID, "baskaSite"],
  ["https://user@youtube.com/watch?v=" + ID, "gecersiz"], ["https://youtube.com:8080/watch?v=" + ID, "gecersiz"],
  ["https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", "liste"], ["https://www.youtube.com/watch?list=PL123", "liste"],
  ["https://www.youtube.com/@kanal", "videoDegil"], ["https://www.youtube.com/channel/UC123", "videoDegil"],
  ["https://www.youtube.com/results?search_query=x", "videoDegil"], ["https://www.youtube.com/", "videoDegil"],
  ["https://www.youtube.com/embed/" + ID, "videoDegil"], ["https://www.youtube-nocookie.com/embed/" + ID, "videoDegil"],
  ["https://studio.youtube.com/video/" + ID + "/edit", "videoDegil"],
  ["https://www.youtube.com/live/kisa", "gecersiz"], ["https://www.youtube.com/live/", "videoDegil"],
  ["https://www.youtube.com/watch?v=kisa", "gecersiz"], ["https://www.youtube.com/watch?v=" + ID + "x", "gecersiz"],
  ["https://www.youtube.com/watch", "gecersiz"], ["https://youtu.be/", "gecersiz"],
  ["javascript:alert(1)//youtu.be/" + ID, "gecersiz"], ["ftp://youtube.com/watch?v=" + ID, "gecersiz"],
  ["file:///C:/video.mp4", "gecersiz"], ["merhaba dünya", "gecersiz"], ["-o /tmp/x https://youtu.be/" + ID + "x", "gecersiz"]
];
red.forEach(function (k) {
  var r = Y.urlCoz(k[0]);
  ok("URL red (" + k[1] + "): " + JSON.stringify(k[0]).slice(0, 60), r.ok === false && r.kod === k[1] && typeof r.mesaj === "string" && r.mesaj.length > 10, js(r));
});
ok("URL: araya yazılan seçenek bile tek video olarak normalleşir (yt-dlp'ye yalnız kanonik adres gider)",
  Y.urlCoz("-o /tmp/x https://youtu.be/" + ID).url === "https://www.youtube.com/watch?v=" + ID);

/* ---------------- 2) -J özeti ---------------- */
function fmt(id, w, h, v, a, ext, not, boyut) { return { format_id: id, width: w, height: h, vcodec: v, acodec: a, ext: ext, format_note: not, filesize: boyut }; }
var J = {
  id: ID, title: "Deneme\nvideosu\t  başlığı", channel: "Suflo Kanal", duration: 3725, live_status: "not_live",
  thumbnail: "https://i.ytimg.com/vi/" + ID + "/maxresdefault.jpg",
  formats: [
    fmt("sb0", 160, 90, "none", "none", "mhtml", "storyboard"),
    fmt("139", null, null, "none", "mp4a.40.5", "m4a", "low", 1000000),
    fmt("140", null, null, "none", "mp4a.40.2", "m4a", "medium", 3000000),
    fmt("251", null, null, "none", "opus", "webm", "medium", 3200000),
    fmt("18", 640, 360, "avc1.42001E", "mp4a.40.2", "mp4", "360p", 9000000),
    fmt("136", 1280, 720, "avc1.4d401f", "none", "mp4", "720p", 20000000),
    fmt("137", 1920, 1080, "avc1.640028", "none", "mp4", "1080p", 40000000),
    fmt("248", 1920, 1080, "vp9", "none", "webm", "1080p"),
    fmt("313", 3840, 2160, "vp9", "none", "webm", "2160p", 300000000),
    fmt("401", 3840, 2160, "av01.0.12M.08", "none", "mp4", "2160p")
  ]
};
var oz = Y.bilgiOzeti(J);
ok("özet: başlık tek satır, kanal, süre ve süre metni", oz.baslik === "Deneme videosu başlığı" && oz.kanal === "Suflo Kanal" && oz.sure === 3725 && oz.sureMetni === "1:02:05", js(oz));
ok("özet: en iyi 2160 (storyboard sayılmaz), ses var, m4a ses boyutu, yatay", oz.enIyi === 2160 && oz.sesVar && oz.sesBoyutu === 3000000 && oz.dikey === false && oz.id === ID);
ok("özet: biçim tablosu (ilerleme için video/ses/boyut)", oz.formatlar["137"].video === true && oz.formatlar["137"].ses === false && oz.formatlar["140"].ses === true && oz.formatlar["137"].boyut === 40000000);
ok("özet: küçük resim yalnız YouTube görsel sunucusundan", oz.kucukResim === J.thumbnail &&
  Y.kucukResimGuvenli("https://evil.com/x.jpg") === "" && Y.kucukResimGuvenli("http://i.ytimg.com/x.jpg") === "" &&
  Y.kucukResimGuvenli("https://i.ytimg.com/x.jpg\" onerror=\"x") === "" && Y.kucukResimGuvenli("https://yt3.ggpht.com/a.jpg") === "https://yt3.ggpht.com/a.jpg");
ok("özet: JSON metni de kabul, bozuk / liste / dizi null", Y.bilgiOzeti(JSON.stringify(J)).enIyi === 2160 && Y.bilgiOzeti("{bozuk") === null &&
  Y.bilgiOzeti({ _type: "playlist", entries: [] }) === null && Y.bilgiOzeti([]) === null && Y.bilgiOzeti(null) === null);
var dikey = Y.bilgiOzeti({ id: ID, title: "Short", formats: [fmt("137", 1080, 1920, "avc1.640028", "none", "mp4", ""), fmt("140", null, null, "none", "mp4a.40.2", "m4a", "", 1)] });
ok("özet: dikey Short 1080×1920 → 1080p ve dikey", dikey.enIyi === 1080 && dikey.dikey === true, js(dikey));
ok("kalite etiketi 16:9 kutuya göre: 1920×804 → 1080, 1440×1080 → 1080, 854×480 → 480", Y.kaliteEtiketi({ width: 1920, height: 804 }) === 1080 &&
  Y.kaliteEtiketi({ width: 1440, height: 1080 }) === 1080 && Y.kaliteEtiketi({ width: 854, height: 480 }) === 480 && Y.kaliteEtiketi({ format_note: "1440p60" }) === 1440);
var canli = Y.bilgiOzeti({ id: ID, title: "Yayın", live_status: "is_live", formats: [] });
ok("canlı yayın / başlamamış / yeni bitmiş: indirme engeli ve mesajı", canli.canli === "is_live" && /canlı yayın/.test(Y.canliEngeli(canli)) &&
  /başlamadı/.test(Y.canliEngeli({ canli: "is_upcoming" })) && /hazırlıyor/.test(Y.canliEngeli({ canli: "post_live" })) && Y.canliEngeli(oz) === "" && Y.canliEngeli(null) === "");
ok("bilinmeyen kimlik özetlenmez (dosya adı eşlemesi için yalnız geçerli 11 karakter)", Y.bilgiOzeti({ id: "../../x", formats: [] }).id === "");

/* ---------------- 3) kalite çipleri ---------------- */
var d4 = Y.kaliteDurumu(oz);
ok("4K video: dört çip açık, etiketler MP3/720p/1080p/4K", d4.mp3.acik && d4["720"].acik && d4["1080"].acik && d4["2160"].acik &&
  d4.mp3.etiket === "MP3" && d4["720"].etiket === "720p" && d4["1080"].etiket === "1080p" && d4["2160"].etiket === "4K", js(d4));
var d1080 = Y.kaliteDurumu({ enIyi: 1080, sesVar: true });
ok("1080p video: 4K kapalı", d1080["1080"].acik && !d1080["2160"].acik);
var d480 = Y.kaliteDurumu({ enIyi: 480, sesVar: true });
ok("480p video: 720 çipi '480p' olarak açık (en iyisi), 1080/4K kapalı", d480["720"].acik && d480["720"].etiket === "480p" && !d480["1080"].acik && !d480["2160"].acik);
var d1440 = Y.kaliteDurumu({ enIyi: 1440, sesVar: true });
ok("1440p video: 4K çipi '1440p' olarak açık", d1440["2160"].acik && d1440["2160"].etiket === "1440p");
var dSes = Y.kaliteDurumu({ enIyi: 0, sesVar: true });
ok("yalnız ses: yalnız MP3", dSes.mp3.acik && !dSes["720"].acik && !dSes["1080"].acik && !dSes["2160"].acik);
var dYok = Y.kaliteDurumu(null);
ok("bilgi yok: hepsi kapalı", !dYok.mp3.acik && !dYok["720"].acik && !dYok["1080"].acik && !dYok["2160"].acik);
ok("varsayılan kalite: kayıtlı tercih açıksa o, yoksa 1080, sonra 720 / 4K / MP3", Y.varsayilanKalite(d4, "2160") === "2160" && Y.varsayilanKalite(d4, "yok") === "1080" &&
  Y.varsayilanKalite(d480, "1080") === "720" && Y.varsayilanKalite(dSes, "1080") === "mp3" && Y.varsayilanKalite(dYok) === "" && Y.varsayilanKalite(null) === "");
ok("dosya etiketi: gerçek kalite (480p), 4K; MP3 ve geçersizde boş", Y.dosyaEtiketi("720", d480) === "480p" && Y.dosyaEtiketi("2160", d4) === "4K" &&
  Y.dosyaEtiketi("1080", null) === "1080p" && Y.dosyaEtiketi("mp3", d4) === "" && Y.dosyaEtiketi("999", d4) === "" && Y.dosyaEtiketi("720", { "720": { etiket: "%(x)s" } }) === "720p");

/* ---------------- 4) yt-dlp argümanları ---------------- */
ok("format: 720p spec (H.264 + m4a önce, sonra en iyi + ses, sonra birleşik)",
  Y.formatSecici("720") === "bv*[vcodec^=avc1][height<=?720][width<=?1280]+ba[ext=m4a]/bv*[height<=?720][width<=?1280]+ba/b[height<=?720][width<=?1280]", Y.formatSecici("720"));
ok("format: 1080p", Y.formatSecici("1080") === "bv*[vcodec^=avc1][height<=?1080][width<=?1920]+ba[ext=m4a]/bv*[height<=?1080][width<=?1920]+ba/b[height<=?1080][width<=?1920]");
ok("format: 4K en iyi ≤2160 (H.264 şartı yok), m4a ses önce", Y.formatSecici("2160") === "bv*[height<=?2160][width<=?3840]+ba[ext=m4a]/bv*[height<=?2160][width<=?3840]+ba/b[height<=?2160][width<=?3840]");
ok("format: dikey Short'ta eksenler yer değiştirir", Y.formatSecici("1080", true) === "bv*[vcodec^=avc1][width<=?1080][height<=?1920]+ba[ext=m4a]/bv*[width<=?1080][height<=?1920]+ba/b[width<=?1080][height<=?1920]");
ok("format: MP3 en iyi ses", Y.formatSecici("mp3") === "ba/b");

var KLASOR = "C:\\Users\\Ömer\\Proje %1\\Suflo İndirilenler";
var a1080 = Y.indirmeArgs({ url: "https://www.youtube.com/watch?v=" + ID, kalite: "1080", klasor: KLASOR, ffmpeg: "C:\\Users\\Ömer\\AppData\\Roaming\\Kesit\\ffmpeg\\ffmpeg.exe", etiket: "1080p" });
function sonraki(a, bayrak) { var i = a.indexOf(bayrak); return i === -1 ? undefined : a[i + 1]; }
ok("args: dizi, her öğe metin (kabuk dizesi yok)", Array.isArray(a1080) && a1080.every(function (x) { return typeof x === "string"; }));
ok("args: spec bayrakları", ["--ignore-config", "--no-playlist", "--newline", "--no-mtime", "--windows-filenames", "--progress"].every(function (b) { return a1080.indexOf(b) !== -1; }), js(a1080));
ok("args: ilerleme ve işlem şablonları, after_move yolu", sonraki(a1080, "--progress-template") === "download:" + Y.ILERLEME_SABLONU &&
  a1080.indexOf("postprocess:" + Y.ISLEM_SABLONU) !== -1 && sonraki(a1080, "--print") === "after_move:SUFLOF %(filepath)j" && sonraki(a1080, "--progress-delta") === "0.5");
ok("args: klasör argümanda yok (-P yok; süreç klasörde çalışır), ad şablonu göreli: spec + kalite etiketi",
  a1080.indexOf("-P") === -1 && a1080.every(function (x) { return x.indexOf(KLASOR) === -1 && x.indexOf("Proje %1") === -1; }) &&
  sonraki(a1080, "-o") === "%(title).150B [%(id)s] 1080p.%(ext)s" && Y.CIKTI_SABLONU === "%(title).150B [%(id)s].%(ext)s", js(a1080));
// macOS: --windows-filenames yt-dlp'de çıktı yolunun HER parçasını temizler (":" "?" → "#"), -P'de $DEGISKEN açılır;
// mutlak klasör verilseydi dosya "Vlog 12#10/Ne Yapsak#/…" klasörüne inerdi
var MAC_KLASOR = "/Users/ali/Projeler/Vlog 12:10/Ne Yapsak?/$HOME proje./Suflo İndirilenler";
["mp3", "720", "1080", "2160"].forEach(function (k) {
  var am = Y.indirmeArgs({ url: "https://www.youtube.com/watch?v=" + ID, kalite: k, klasor: MAC_KLASOR, ffmpeg: "/opt/homebrew/bin/ffmpeg", etiket: k === "mp3" ? "" : (k === "2160" ? "4K" : k + "p") });
  ok("args " + k + ": macOS klasörü (':' '?' '$' sondaki nokta) hiçbir argümanda yok, -P yok, -o göreli",
    am.indexOf("-P") === -1 && am.indexOf("--paths") === -1 && am.every(function (x) { return x.indexOf("Vlog 12") === -1 && x.indexOf("Suflo İndirilenler") === -1; }) &&
    !/^[\\\/]|^[A-Za-z]:/.test(sonraki(am, "-o")) && am.indexOf("--windows-filenames") !== -1, js(am));
});
ok("args: Suflo'nun ffmpeg'i --ffmpeg-location", sonraki(a1080, "--ffmpeg-location") === "C:\\Users\\Ömer\\AppData\\Roaming\\Kesit\\ffmpeg\\ffmpeg.exe");
ok("args: video biçimi, sıralama (VP9 SDR, AV1/HDR değil) ve MP4 birleştirme", sonraki(a1080, "-f") === Y.formatSecici("1080") && sonraki(a1080, "-S") === "res,fps,vcodec:vp9" &&
  sonraki(a1080, "--merge-output-format") === "mp4" && a1080.indexOf("-x") === -1);
ok("args: '--' ve adres en sonda", a1080[a1080.length - 2] === "--" && a1080[a1080.length - 1] === "https://www.youtube.com/watch?v=" + ID);
var aMp3 = Y.indirmeArgs({ url: "https://www.youtube.com/watch?v=" + ID, kalite: "mp3", klasor: "/Users/a/Movies/Suflo İndirilenler", ffmpeg: "ffmpeg" });
ok("args MP3: -x --audio-format mp3 --audio-quality 0, birleştirme / sıralama yok, ad etiketsiz", sonraki(aMp3, "-f") === "ba/b" && sonraki(aMp3, "--audio-format") === "mp3" &&
  sonraki(aMp3, "--audio-quality") === "0" && aMp3.indexOf("-x") !== -1 && aMp3.indexOf("--merge-output-format") === -1 && aMp3.indexOf("-S") === -1 && sonraki(aMp3, "-o") === Y.CIKTI_SABLONU);
ok("args: çıplak 'ffmpeg' (PATH) --ffmpeg-location olarak verilmez", aMp3.indexOf("--ffmpeg-location") === -1 && Y.ffmpegKonumu("ffmpeg.exe") === "" && Y.ffmpegKonumu("/opt/homebrew/bin/ffmpeg") === "/opt/homebrew/bin/ffmpeg");
var a4k = Y.indirmeArgs({ url: "u", kalite: "2160", klasor: "/k", dikey: true, etiket: "4K" });
ok("args 4K dikey", sonraki(a4k, "-f") === Y.formatSecici("2160", true) && sonraki(a4k, "-o") === "%(title).150B [%(id)s] 4K.%(ext)s");
ok("args: şablonu bozabilecek etiket yok sayılır", sonraki(Y.indirmeArgs({ url: "u", kalite: "720", klasor: "/k", etiket: "%(id)s" }), "-o") === Y.CIKTI_SABLONU);
var hata1 = "", hata2 = "";
try { Y.indirmeArgs({ url: "u", kalite: "8k", klasor: "/k" }); } catch (e) { hata1 = e.message; }
try { Y.indirmeArgs({ url: "u", kalite: "720" }); } catch (e) { hata2 = e.message; }
ok("args: geçersiz kalite ve klasörsüz çağrı reddedilir", /kalite/.test(hata1) && /klasör/.test(hata2));
var aJs = Y.indirmeArgs({ url: "u", kalite: "720", klasor: "/k", jsRuntime: "/Users/a/.deno/bin/deno", surum: "2026.08.19" });
var aJsEski = Y.indirmeArgs({ url: "u", kalite: "720", klasor: "/k", jsRuntime: "/Users/a/.deno/bin/deno", surum: "2025.10.22" });
ok("args: Deno yolu --js-runtimes ile (yalnız bu bayrağı tanıyan sürümde)", sonraki(aJs, "--js-runtimes") === "deno:/Users/a/.deno/bin/deno" && aJsEski.indexOf("--js-runtimes") === -1);
ok("args: Suflo'nun vekil sunucusu --proxy ile", sonraki(Y.indirmeArgs({ url: "u", kalite: "720", klasor: "/k", proxy: "http://vekil:8080" }), "--proxy") === "http://vekil:8080");
ok("Deno adayları: resmî kurucu (~/.deno/bin) önce; Windows ve macOS", js(Y.denoAdaylari("darwin", "/Users/a/")) === js(["/Users/a/.deno/bin/deno", "/opt/homebrew/bin/deno", "/usr/local/bin/deno"]) &&
  Y.denoAdaylari("win32", "C:\\Users\\Ömer")[0] === "C:\\Users\\Ömer\\.deno\\bin\\deno.exe" && Y.denoAdaylari("win32", "").length === 1);
ok("vekil adresi: şemasız http://, boş / boşluklu yok sayılır", Y.vekilAdresi(" vekil.local:8080 ") === "http://vekil.local:8080" && Y.vekilAdresi("socks5://127.0.0.1:1080") === "socks5://127.0.0.1:1080" &&
  Y.vekilAdresi("") === "" && Y.vekilAdresi("a b") === "" && Y.vekilAdresi(null) === "");
var b = Y.bilgiArgs("https://www.youtube.com/watch?v=" + ID, {});
ok("bilgi args: --ignore-config --no-playlist -J -- adres", js(b) === js(["--ignore-config", "--no-playlist", "-J", "--", "https://www.youtube.com/watch?v=" + ID]), js(b));

/* ---------------- 5) ilerleme satırları ---------------- */
var s1 = Y.satirCoz("SUFLOP downloading 1024 64817 NA NA NA mp4");
ok("satır: indiriliyor (NA → null)", s1.tur === "indir" && s1.durum === "downloading" && s1.indirilen === 1024 && s1.toplam === 64817 && s1.hiz === null && s1.eta === null && s1.format === "mp4", js(s1));
var s2 = Y.satirCoz("SUFLOP downloading 5242880 NA 52428800.0 2097152.5 22 137\r");
ok("satır: toplam yoksa tahmin, hız ve kalan süre, \\r atılır", s2.toplam === 52428800 && s2.hiz === 2097152.5 && s2.eta === 22 && s2.format === "137", js(s2));
var s3 = Y.satirCoz("SUFLOP finished NA 64817 NA NA NA mp4");
ok("satır: önceden inmiş dosya (inen NA)", s3.durum === "finished" && s3.indirilen === null && s3.toplam === 64817);
ok("satır: işlem (Merger / ExtractAudio)", js(Y.satirCoz("SUFLOPP started Merger")) === js({ tur: "islem", durum: "started", islem: "Merger" }));
var s4 = Y.satirCoz('SUFLOF "/tmp/\\u00e7\\u0131kt\\u0131 %d/h264 [h264] 1080p.mp4"');
ok("satır: dosya yolu JSON'dan (Türkçe harf ASCII kaçışla)", s4 && s4.tur === "dosya" && s4.yol === "/tmp/çıktı %d/h264 [h264] 1080p.mp4", js(s4));
ok("satır: Windows yolu", Y.satirCoz('SUFLOF "C:\\\\Users\\\\\\u00d6mer\\\\a [x].mp4"').yol === "C:\\Users\\Ömer\\a [x].mp4");
ok("satır: başka satırlar ve bozuk JSON null", Y.satirCoz("[youtube] x: Downloading webpage") === null && Y.satirCoz('SUFLOF "yarım') === null &&
  Y.satirCoz("SUFLOF 123") === null && Y.satirCoz("") === null && Y.satirCoz("WARNING: SUFLOP x") === null);
var tp = Y.satirTamponu();
var t1 = tp.besle("SUFLOP downloading 1 10 NA NA NA 1"), t2 = tp.besle("37\r\nSUFLOPP started Mer"), t3 = tp.besle("ger\n\n"), t4 = tp.bitir();
ok("satır tamponu: parça sınırında bölünen satır birleşir, boş satır atılır", t1.length === 0 && js(t2) === js(["SUFLOP downloading 1 10 NA NA NA 137"]) && js(t3) === js(["SUFLOPP started Merger"]) && t4.length === 0, js([t1, t2, t3, t4]));

/* ---------------- 6) izleyici ---------------- */
var iz = Y.izleyici({ kalite: "1080", formatlar: oz.formatlar, sesBoyutu: oz.sesBoyutu });
var oranlar = [];
[["downloading", 0, 40000000, "137"], ["downloading", 20000000, 40000000, "137"], ["finished", 40000000, 40000000, "137"],
  ["downloading", 1000000, 3000000, "140"], ["finished", 3000000, 3000000, "140"]].forEach(function (x) {
  oranlar.push(iz.besle({ tur: "indir", durum: x[0], indirilen: x[1], toplam: x[2], hiz: 1048576, eta: 10, format: x[3] }).oran);
});
var birlestirme = iz.besle({ tur: "islem", durum: "started", islem: "Merger" });
ok("izleyici: video + ses tek yüzde, geri gitmez, ses parçası baştan tahmin edilir", oranlar.every(function (o, i) { return i === 0 || o >= oranlar[i - 1]; }) &&
  Math.abs(oranlar[1] - 0.95 * 20 / 43) < 1e-9 && Math.abs(oranlar[4] - 0.95) < 1e-9, js(oranlar));
ok("izleyici: birleştirme aşaması", birlestirme.asama === "birlestir" && birlestirme.oran === 0.95 && iz.asama() === "birlestir");
var izOnce = Y.izleyici({ kalite: "1080" });
ok("izleyici: önceden inmiş dosya %95", izOnce.besle(Y.satirCoz("SUFLOP finished NA 64817 NA NA NA mp4")).oran === 0.95);
var izMp3 = Y.izleyici({ kalite: "mp3" });
izMp3.besle({ tur: "indir", durum: "downloading", indirilen: 50, toplam: 100, format: "251" });
ok("izleyici: MP3'e çevirme aşaması, null güvenli", izMp3.besle({ tur: "islem", durum: "started", islem: "ExtractAudio" }).asama === "mp3" && izMp3.besle(null) === null && izMp3.besle({ tur: "dosya" }) === null);

/* ---------------- 7) metinler ---------------- */
ok("hız / boyut metni Türkçe ondalık", Y.hizMetni(4404019) === "4,2 MB/sn" && Y.hizMetni(512000) === "500 KB/sn" && Y.hizMetni(null) === "" && Y.hizMetni(0) === "" &&
  Y.boyutMetni(1610612736) === "1,5 GB" && Y.boyutMetni(18874368) === "18,0 MB" && Y.boyutMetni(209715200) === "200 MB" && Y.boyutMetni(1000) === "1 KB");
ok("kalan süre canlı transkripsiyonla aynı biçim, saatler", Y.kalanMetni(45) === "~45 sn kaldı" && Y.kalanMetni(80) === "~1 dk 20 sn kaldı" && Y.kalanMetni(720) === "~12 dk kaldı" &&
  Y.kalanMetni(3900) === "~1 sa 5 dk kaldı" && Y.kalanMetni(7200) === "~2 sa kaldı" && Y.kalanMetni(null) === "" && Y.kalanMetni(-1) === "");
ok("ilerleme metni", Y.ilerlemeMetni({ asama: "indir", oran: 0.4567, hiz: 4404019, eta: 80 }) === "İndiriliyor… · %45 · 4,2 MB/sn · ~1 dk 20 sn kaldı" &&
  Y.ilerlemeMetni({ asama: "birlestir", oran: 0.95, hiz: null, eta: null }) === "Görüntü ve ses birleştiriliyor… · %95" && Y.ilerlemeMetni(null) === "");

/* ---------------- 8) yt-dlp ikilisi: varlık, adres, SHA2-256SUMS ---------------- */
var SUMS = fs.readFileSync(path.join(__dirname, "fixtures", "yt-dlp-2026.08.19-SHA2-256SUMS.txt"), "utf8");
var liste = Y.sumsCoz(SUMS);
ok("SUMS (gerçek 2026.08.19 listesi): 19 dosya, küçük harf hex", Object.keys(liste).length === 19 &&
  liste["yt-dlp.exe"] === "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a" && liste["yt-dlp_macos"] === "0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202");
ok("varlık: Windows yt-dlp.exe, ARM Windows yerel arm64, macOS yt-dlp_macos, Linux yt-dlp_linux", Y.varlikSec(liste, "win32", "x64") === "yt-dlp.exe" &&
  Y.varlikSec(liste, "win32", "arm64") === "yt-dlp_arm64.exe" && Y.varlikSec(liste, "darwin", "arm64") === "yt-dlp_macos" && Y.varlikSec(liste, "darwin", "x64") === "yt-dlp_macos" &&
  Y.varlikSec(liste, "linux", "x64") === "yt-dlp_linux" && Y.varlikSec(SUMS, "win32", "x64") === "yt-dlp.exe");
var eksik = {}; eksik["yt-dlp.exe"] = liste["yt-dlp.exe"];
ok("varlık: arm64 listede yoksa x64'e düşer; aday listede hiç yoksa null; bilinmeyen platform null", Y.varlikSec(eksik, "win32", "arm64") === "yt-dlp.exe" &&
  Y.varlikSec(eksik, "darwin", "arm64") === null && Y.varlikSec(liste, "freebsd", "x64") === null && Y.varlikSec(null, "darwin") === "yt-dlp_macos");
ok("yerel ad", Y.yerelAd("win32") === "yt-dlp.exe" && Y.yerelAd("darwin") === "yt-dlp");
var adr = Y.indirmeAdresleri("2026.08.19", "yt-dlp.exe");
ok("adres: ikili ve SUMS aynı etiketten", adr.ikili === "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe" &&
  adr.sums === "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/SHA2-256SUMS" && adr.etiket === "2026.08.19");
var adrL = Y.indirmeAdresleri("../../evil", "yt-dlp_macos");
ok("adres: etiket yoksa / geçersizse latest", adrL.ikili === "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" && adrL.etiket === "" &&
  Y.indirmeAdresleri("", "yt-dlp").sums === "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS");
var adrHata = "";
try { Y.indirmeAdresleri("2026.08.19", "../yt-dlp"); } catch (e) { adrHata = e.message; }
ok("adres: dosya adında yol / garip karakter reddedilir", /Geçersiz/.test(adrHata));
var api = { tag_name: "2026.08.19", assets: [{ name: "yt-dlp.exe", digest: "sha256:66674953FE251B89F4D08C5F0E35E0728679BD67AB3D7D05C0562AF101DD3E7A" }, { name: "x", digest: "md5:1" }, null] };
var sc = Y.surumCoz(api);
ok("API: etiket ve sha256 özetleri (küçük harf)", sc.etiket === "2026.08.19" && sc.ozetler["yt-dlp.exe"] === liste["yt-dlp.exe"] && !("x" in sc.ozetler) && Y.surumCoz(JSON.stringify(api)).etiket === "2026.08.19");
ok("API: bozuk yanıt / garip etiket null", Y.surumCoz({ tag_name: "latest" }) === null && Y.surumCoz("{") === null && Y.surumCoz(null) === null && Y.surumCoz({ message: "API rate limit" }) === null);
var celiskili = Y.sumsCoz("aa".repeat(32) + "  yt-dlp.exe\n" + "bb".repeat(32) + "  yt-dlp.exe\n" + "CC".repeat(32) + " *yt-dlp_macos\nçöp satır\n" + "dd".repeat(31) + "  kisa\n");
ok("SUMS: aynı ad iki özetle → geçersiz; '*' ikili işareti; çöp ve kısa özet atlanır", !("yt-dlp.exe" in celiskili) && celiskili["yt-dlp_macos"] === "cc".repeat(32) && Object.keys(celiskili).length === 1, js(celiskili));
ok("doğrulama: aynı özet geçer (büyük/küçük harf fark etmez)", Y.ozetDogrula(SUMS, "yt-dlp.exe", liste["yt-dlp.exe"].toUpperCase()).ok === true);
ok("doğrulama: farklı özet reddedilir", Y.ozetDogrula(liste, "yt-dlp.exe", liste["yt-dlp_macos"]).kod === "uyusmadi");
ok("doğrulama: listede olmayan dosya, bozuk özet reddedilir", Y.ozetDogrula(liste, "yt-dlp_evil.exe", liste["yt-dlp.exe"]).kod === "listedeYok" &&
  Y.ozetDogrula(liste, "yt-dlp.exe", "").kod === "ozetYok" && Y.ozetDogrula(liste, "yt-dlp.exe", "zz").kod === "ozetYok" && Y.ozetDogrula(null, "yt-dlp.exe", liste["yt-dlp.exe"]).kod === "listedeYok");
ok("doğrulama: API özeti SUMS'la çelişirse reddedilir", Y.ozetDogrula(liste, "yt-dlp.exe", liste["yt-dlp.exe"], "ab".repeat(32)).kod === "apiCeliski" &&
  Y.ozetDogrula(liste, "yt-dlp.exe", liste["yt-dlp.exe"], sc.ozetler["yt-dlp.exe"]).ok === true);
ok("doğrulama mesajları", ["ozetYok", "listedeYok", "apiCeliski", "uyusmadi", "?"].every(function (k) { return /yt-dlp|SHA|GitHub/.test(Y.dogrulamaMesaji(k)); }));
ok("sürüm karşılaştırma ve --version çıktısı", Y.surumKarsilastir("2026.08.19", "2026.08.02") === 1 && Y.surumKarsilastir("2026.08.19", "2026.08.19.1") === -1 &&
  Y.surumKarsilastir("2026.08.19", "2026.08.19") === 0 && Y.ytdlpSurumu("2026.08.19\n") === "2026.08.19" && Y.ytdlpSurumu("2026.08.19.232415 from yt-dlp/yt-dlp-nightly-builds") === "2026.08.19.232415" && Y.ytdlpSurumu("hata") === "");
var GUN = 86400000, SIMDI = Date.UTC(2026, 9, 12);
var meta = { v: 1, surum: "2026.08.19", varlik: "yt-dlp.exe", sha256: liste["yt-dlp.exe"], kuruldu: SIMDI - 10 * GUN, denetim: 0 };
ok("kayıt geçerli; sha256'sız / bozuk varlık / garip sürüm geçersiz", Y.metaGecerliMi(meta) && !Y.metaGecerliMi({ v: 1, varlik: "yt-dlp.exe", kuruldu: 1 }) &&
  !Y.metaGecerliMi({ v: 1, varlik: "../x", sha256: meta.sha256, kuruldu: 1 }) && !Y.metaGecerliMi({ v: 1, varlik: "x", sha256: meta.sha256, kuruldu: 1, surum: "x;y" }) && !Y.metaGecerliMi(null));
ok("30 gün: 10 günlük güncel, 31 günlük eski, son denetim tazeler", !Y.eskiMi(meta, SIMDI) && Y.eskiMi({ kuruldu: SIMDI - 31 * GUN }, SIMDI) &&
  !Y.eskiMi({ kuruldu: SIMDI - 90 * GUN, denetim: SIMDI - GUN }, SIMDI) && Y.eskiMi(null, SIMDI) && Y.ESKI_GUN === 30);
var eskiMeta = { v: 1, surum: "2026.07.01", varlik: "yt-dlp.exe", sha256: meta.sha256, kuruldu: SIMDI - 45 * GUN };
ok("Güncelle ipucu yalnız 30 günü aşınca (gün sayısıyla)", Y.guncellemeIpucu(meta, SIMDI) === null && Y.guncellemeIpucu(eskiMeta, SIMDI).gun === 45 &&
  /45 gündür/.test(Y.guncellemeIpucu(eskiMeta, SIMDI).metin) && Y.guncellemeIpucu(null, SIMDI) === null);
var dr = [
  Y.doctorSatiri({ kurulu: false }),
  Y.doctorSatiri({ kurulu: true, dogrulandi: false, meta: meta }),
  Y.doctorSatiri({ kurulu: true, dogrulandi: true, meta: meta, enSon: "2026.09.30", simdi: SIMDI }),
  Y.doctorSatiri({ kurulu: true, dogrulandi: true, meta: meta, enSon: "2026.08.19", simdi: SIMDI }),
  Y.doctorSatiri({ kurulu: true, dogrulandi: true, meta: eskiMeta, enSon: "", simdi: SIMDI }),
  Y.doctorSatiri({ kurulu: true, dogrulandi: true, meta: meta, enSon: "", simdi: SIMDI })
];
ok("Doctor: kurulu değil uyarı DEĞİL (gerekince iner)", dr[0].status === "good" && /Kurulu değil/.test(dr[0].detail) && !dr[0].action);
ok("Doctor: doğrulanamayan ikili uyarı + Güncelle onarımı", dr[1].status === "warn" && dr[1].action === "update-ytdlp");
ok("Doctor: güncelleme var (sürümlerle)", dr[2].status === "warn" && dr[2].action === "update-ytdlp" && dr[2].detail === "2026.08.19 kurulu · 2026.09.30 hazır" && dr[2].title === "yt-dlp güncellemesi var");
ok("Doctor: güncel", dr[3].status === "good" && dr[3].detail === "2026.08.19 · güncel");
ok("Doctor: denetlenemedi + 30 günden eski uyarı, taze ise iyi", dr[4].status === "warn" && dr[4].action === "update-ytdlp" && dr[5].status === "good" && /denetlenemedi/.test(dr[5].detail));

/* ---------------- 9) hatalar ---------------- */
var HATA_ORNEK = [
  ["ERROR: [youtube] " + ID + ": Private video. Sign in if you've been granted access to this video", "ozel", false],
  ["ERROR: [youtube] " + ID + ": Join this channel to get access to members-only content like this video, and other exclusive perks.", "uyelere", false],
  ["ERROR: [youtube] " + ID + ": Sign in to confirm your age. This video may be inappropriate for some users.", "yas", false],
  ["ERROR: [youtube] " + ID + ": Video unavailable. The uploader has not made this video available in your country", "bolge", false],
  ["ERROR: [youtube] " + ID + ": Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication.", "giris", true],
  ["ERROR: [youtube] " + ID + ": This live event will begin in 3 hours.", "canli", false],
  ["ERROR: [youtube] " + ID + ": Premieres in 2 days", "canli", false],
  ["ERROR: [youtube] " + ID + ": Video unavailable. This video has been removed by the uploader", "yok", false],
  ["ERROR: [youtube] " + ID + ": Unable to download API page: <urlopen error [Errno 11001] getaddrinfo failed> (caused by URLError)", "ag", false],
  ["ERROR: [youtube] " + ID + ": Unable to download webpage: <urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed>", "ag", false],
  ["ERROR: unable to download video data: HTTP Error 403: Forbidden", "eski", true],
  ["ERROR: [youtube] " + ID + ": Signature extraction failed: Some formats may be missing; please report this issue on https://github.com/yt-dlp/yt-dlp/issues", "eski", true],
  ["ERROR: [youtube] " + ID + ": Requested format is not available. Use --list-formats for a list of available formats", "formatYok", true],
  ["ERROR: unable to write data: [Errno 28] No space left on device", "disk", false],
  ["ERROR: unable to write data: [WinError 112] There is not enough space on the disk", "disk", false],
  ["ERROR: unable to open for writing: [Errno 13] Permission denied: 'C:\\\\x.part'", "yazilamaz", false],
  ["ERROR: Postprocessing: ffprobe and ffmpeg not found. Please install or provide the path using --ffmpeg-location", "ffmpegYok", false],
  ["ERROR: [youtube] x: Incomplete YouTube ID x. URL https://www.youtube.com/watch?v=x looks truncated.", "gecersizUrl", false],
  ["ERROR: Unable to download webpage: HTTP Error 429: Too Many Requests", "cokIstek", false],
  // yt-dlp 2026.08.19 (extractor/youtube/_video.py): oturum kısıtı "Video unavailable" ile başlar; video var
  ["ERROR: [youtube] " + ID + ": Video unavailable. This content isn't available, try again later. The current session has been rate-limited by YouTube for up to an hour. " +
    "It is recommended to use `-t sleep` to add a delay between video requests to avoid exceeding the rate limit. For more information, refer to " +
    "https://github.com/yt-dlp/yt-dlp/wiki/Extractors#this-content-isnt-available-try-again-later", "cokIstek", false],
  ["Error: spawn C:\\Users\\a\\AppData\\Roaming\\Kesit\\yt-dlp\\yt-dlp.exe ENOENT", "calismadi", true],
  ["Error: spawn /Users/a/Library/Application Support/Suflo/yt-dlp/yt-dlp EACCES", "calismadi", true],
  ["[PYI-4242:ERROR] Failed to extract embedded archive", "calismadi", true]
];
HATA_ORNEK.forEach(function (h) {
  var r = Y.hataSinifla(h[0], "");
  ok("hata → " + h[1] + ": " + h[0].slice(0, 60), r.kod === h[1] && r.guncelle === h[2] && typeof r.mesaj === "string" && r.mesaj.length > 15, js(r));
});
var uyarili = Y.hataSinifla("WARNING: [youtube] Falling back to generic n function search\nWARNING: unable to extract yt initial data; please report this issue\nERROR: [youtube] " + ID + ": Private video. Sign in", "");
ok("hata: WARNING satırları ERROR'u ezmez", uyarili.kod === "ozel", js(uyarili));
var bilinmeyen = Y.hataSinifla("ERROR: tuhaf bir şey oldu\n", "");
ok("hata: bilinmeyen → son ERROR satırı (ERROR: öneki atılır)", bilinmeyen.kod === "bilinmeyen" && bilinmeyen.satir === "tuhaf bir şey oldu" && bilinmeyen.guncelle === false);
// ffmpeg (Premiere için dönüştürme) disk hatası: video adındaki "Disk Is Full" sayılmaz, yalnız işletim sisteminin hatası
var FF_GIRDI = "C:\\Users\\Ömer\\Suflo İndirilenler\\When Your Disk Is Full [" + ID + "] 4K.mp4";
var FF_GECICI = "C:\\Users\\Ömer\\Suflo İndirilenler\\When Your Disk Is Full [" + ID + "] 4K.suflo-tmp.mp4";
var FF_MF_HATA = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '" + FF_GIRDI + "':\n  Metadata:\n    major_brand     : isom\n    title           : Not Enough Space For Love\n" +
  "  Duration: 00:00:10.00, start: 0.000000, bitrate: 9000 kb/s\n  Stream #0:0[0x1](und): Video: vp9 (Profile 0) (vp09 / 0x39307076), yuv420p(tv, bt709), 3840x2160, 25 fps\n" +
  "Stream mapping:\n  Stream #0:0 -> #0:0 (vp9 (native) -> h264 (h264_mf))\n[h264_mf @ 000001] could not set output type (80004005)\n" +
  "Error while opening encoder for output stream #0:0 - maybe incorrect parameters such as bit_rate, rate, width or height\nConversion failed!\n";
ok("hataSinifla tüm ffmpeg metninde başlıktaki 'Disk Is Full'u disk sanar (bu yüzden ayrı denetim)", Y.hataSinifla(FF_MF_HATA, "").kod === "disk");
ok("ffmpeg disk: kodlayıcı hatası + başlıkta / meta veride 'Disk Is Full', 'Not Enough Space' → disk değil",
  Y.ffmpegDiskDolu(FF_MF_HATA, [FF_GIRDI, FF_GECICI]) === false && Y.ffmpegDiskDolu(FF_MF_HATA, []) === false &&
  Y.ffmpegDiskDolu("Output #0, mp4, to 'C:\\k\\No space left on device [" + ID + "].suflo-tmp.mp4':\nError initializing output stream", []) === false);
ok("ffmpeg disk: gerçek disk dolu hataları (Linux/macOS strerror, Windows, çıktı yolu satır içinde)",
  Y.ffmpegDiskDolu("frame= 100 fps=20\nav_interleaved_write_frame(): No space left on device\nError writing trailer of " + FF_GECICI + ": No space left on device\nConversion failed!", [FF_GIRDI, FF_GECICI]) &&
  Y.ffmpegDiskDolu("[mp4 @ 0x1] Error number -28 occurred", []) && Y.ffmpegDiskDolu("[out#0/mp4] Error writing trailer: There is not enough space on the disk.", []) &&
  Y.ffmpegDiskDolu("Error writing trailer of /k/a.suflo-tmp.mp4: No space left on device", ["/k/a.mp4", "/k/a.suflo-tmp.mp4"]));
ok("uyarı: JS çalıştırıcısı yok", Y.uyarilar("WARNING: [youtube] No supported JavaScript runtime could be found. YouTube extraction without a JS runtime has been deprecated").jsYok === true &&
  Y.uyarilar("WARNING: [youtube] x: nothing").jsYok === false && /Deno/.test(Y.JS_YOK_METNI));

/* ---------------- 10) klasör, artık ve iptal dosyaları ---------------- */
ok("varsayılan klasör: proje yanında 'Suflo İndirilenler'", Y.varsayilanKlasor({ projeKlasoru: "D:\\Projeler\\Düğün\\", platform: "win32" }) === "D:\\Projeler\\Düğün\\Suflo İndirilenler" &&
  Y.varsayilanKlasor({ projeKlasoru: "/Users/ayşe/Proje", platform: "darwin" }) === "/Users/ayşe/Proje/Suflo İndirilenler");
ok("varsayılan klasör: proje kaydedilmemişse Videolar / Filmler", Y.varsayilanKlasor({ ev: "C:\\Users\\Ömer", platform: "win32" }) === "C:\\Users\\Ömer\\Videos\\Suflo İndirilenler" &&
  Y.varsayilanKlasor({ ev: "/Users/a", platform: "darwin" }) === "/Users/a/Movies/Suflo İndirilenler" && Y.varsayilanKlasor({}) === "" && Y.KLASOR_ADI === "Suflo İndirilenler");
ok("klasör notu: macOS'ta Filmler (Movies), Windows'ta Videolar; açık proje yokken de doğru", /Filmler \(Movies\)/.test(Y.klasorNotu("darwin")) && /Videolar/.test(Y.klasorNotu("win32")) &&
  !/Movies/.test(Y.klasorNotu("win32")) && /ya da açık değil/.test(Y.klasorNotu("darwin")));
var GO = Y.geciciOrtam("C:\\Users\\Ömer\\AppData\\Roaming\\Suflo\\yt-dlp\\tmp");
ok("yt-dlp geçici ortamı: TMPDIR / TEMP / TMP aynı Suflo klasörü; klasör yoksa ortam değişmez",
  GO.TMPDIR === "C:\\Users\\Ömer\\AppData\\Roaming\\Suflo\\yt-dlp\\tmp" && GO.TEMP === GO.TMPDIR && GO.TMP === GO.TMPDIR && Object.keys(GO).length === 3 && Y.geciciOrtam("") === null);
ok("PyInstaller artığı: yalnız _MEI… klasörleri", Y.meiArtigiMi("_MEI123456") && Y.meiArtigiMi("_MEIa1B2c3") && !Y.meiArtigiMi("_MEI") && !Y.meiArtigiMi("MEI123") &&
  !Y.meiArtigiMi("x_MEI123") && !Y.meiArtigiMi("_MEI12/..") && !Y.meiArtigiMi("suflo-ytdlp.json") && !Y.meiArtigiMi(""));
var ARTIK = ["a [" + ID + "] 1080p.mp4.part", "a [" + ID + "] 1080p.f137.mp4", "a [" + ID + "] 1080p.f140.m4a.part", "a [" + ID + "] 1080p.mp4.ytdl", "a [" + ID + "] 1080p.temp.mp4",
  "a [" + ID + "] 4K.suflo-tmp.mp4", "a [" + ID + "] 1080p.mp4.part-Frag12", "a [" + ID + "].webm.part-Frag3.part"];
ok("artık dosyalar tanınır, tamamlanmış dosya tanınmaz", ARTIK.every(Y.artikMi) && !Y.artikMi("a [" + ID + "] 1080p.mp4") && !Y.artikMi("a [" + ID + "].mp3") && !Y.artikMi("film.final.mp4"));
var once = ["eski [" + ID + "] 720p.mp4", "eski [" + ID + "] 720p.mp4.part", "baska [AAAAAAAAAAA].mp4", "notlar.txt"];
var simdi = once.concat(["a [" + ID + "] 1080p.f137.mp4.part", "a [" + ID + "] 1080p.mp4", "b [BBBBBBBBBBB].mp4.part"]);
var sil = Y.iptalSilinecekler(once, simdi, ID);
ok("iptal: bu videonun yeni dosyaları + eski yarımları silinir; önceden tamamlanmış dosya ve başka videolar kalır",
  js(sil.sort()) === js(["a [" + ID + "] 1080p.f137.mp4.part", "a [" + ID + "] 1080p.mp4", "eski [" + ID + "] 720p.mp4.part"].sort()), js(sil));
ok("iptal: kimlik yoksa hiçbir şey silinmez", Y.iptalSilinecekler([], simdi, "").length === 0);
ok("hata sonrası yalnız yarım dosyalar", js(Y.hataSilinecekler(simdi, ID).sort()) === js(["a [" + ID + "] 1080p.f137.mp4.part", "eski [" + ID + "] 720p.mp4.part"].sort()));
var adlar = ["eski [" + ID + "] 720p.mp4", "a [" + ID + "] 1080p.webm", "a [" + ID + "] 1080p.mp4", "a [" + ID + "] 1080p.f137.mp4", "a [" + ID + "].mp3", "x [" + ID + "].txt"];
ok("son dosya: yeni, beklenen etiketli, MP4 önce; MP3'te ses", Y.sonDosyaBul(adlar, ID, "1080", ["eski [" + ID + "] 720p.mp4"], "1080p") === "a [" + ID + "] 1080p.mp4" &&
  Y.sonDosyaBul(adlar, ID, "mp3", adlar.slice(0, 3)) === "a [" + ID + "].mp3" && Y.sonDosyaBul(["eski [" + ID + "] 720p.mp4"], ID, "720", ["eski [" + ID + "] 720p.mp4"], "720p") === "eski [" + ID + "] 720p.mp4" &&
  Y.sonDosyaBul(adlar, "BBBBBBBBBBB", "1080") === "");

/* ---------------- 11) Premiere uyumu ve dönüştürme ---------------- */
var VP9 = "Input #0, matroska,webm, from 'x.webm':\n  Duration: 00:00:03.01, start: -0.007000, bitrate: 270 kb/s\n" +
  "  Stream #0:0: Video: vp9 (Profile 1), gbrp(pc, gbr/unknown/unknown, progressive), 1280x720, SAR 1:1 DAR 16:9, 25 fps, 25 tbr, 1k tbn\n" +
  "  Stream #0:1: Audio: opus, 48000 Hz, mono, fltp\nAt least one output file must be specified\n";
var H264 = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'x.mp4':\n  Duration: 00:00:03.00, start: 0.000000, bitrate: 172 kb/s\n" +
  "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 92 kb/s, 25 fps, 25 tbr, 12800 tbn (default)\n" +
  "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)\n";
var HDR = "  Duration: 01:02:03.50, start: 0.000000\n  Stream #0:0[0x1](und): Video: av1 (libdav1d) (Main) (av01 / 0x31307661), yuv420p10le(tv, bt2020nc/bt2020/smpte2084), 3840x2160, 25 fps\n" +
  "  Stream #0:1[0x2](und): Video: mjpeg (Baseline), yuvj420p(pc), 1280x720, 90k tbr (attached pic)\n  Stream #0:2: Audio: aac (LC), 48000 Hz, stereo\n";
var MP3 = "Input #0, mp3, from 'x.mp3':\n  Duration: 00:00:03.02, start: 0.023021, bitrate: 91 kb/s\n  Stream #0:0: Audio: mp3, 48000 Hz, mono, fltp, 91 kb/s\n";
var aV = Y.akisBilgisi(VP9), aH = Y.akisBilgisi(H264), aR = Y.akisBilgisi(HDR), aM = Y.akisBilgisi(MP3);
ok("akış: VP9 + Opus, boyut, süre", aV.video === "vp9" && aV.ses === "opus" && aV.genislik === 1280 && aV.yukseklik === 720 && Math.abs(aV.sure - 3.01) < 1e-9 && !aV.hdr, js(aV));
ok("akış: H.264 + AAC 1080p", aH.video === "h264" && aH.ses === "aac" && aH.yukseklik === 1080);
ok("akış: 4K AV1 HDR 10 bit, kapak resmi sayılmaz, süre saatli", aR.video === "av1" && aR.onBit && aR.hdr && aR.yukseklik === 2160 && aR.sure === 3723.5 && aR.ses === "aac", js(aR));
ok("akış: MP3", aM.video === "" && aM.ses === "mp3");
var kV = Y.donusumKarari(aV, "x [id] 4K.webm"), kH = Y.donusumKarari(aH, "x [id] 1080p.mp4"), kR = Y.donusumKarari(aR, "x.mp4"), kM = Y.donusumKarari(aM, "x.mp3");
ok("karar: VP9/Opus WebM → H.264 + AAC", kV.gerekli && kV.video === "encode" && kV.ses === "aac" && !kV.sesDosyasi);
ok("karar: H.264/AAC MP4 dokunulmaz", !kH.gerekli && kH.video === "copy" && kH.ses === "copy");
ok("karar: AV1 + AAC MP4 → yalnız görüntü kodlanır, ses kopya", kR.gerekli && kR.video === "encode" && kR.ses === "copy");
ok("karar: MP3 dokunulmaz; H.264 MKV'de yalnız kap değişir; okunamayan akış denenmez", !kM.gerekli && kM.sesDosyasi && Y.donusumKarari(aH, "x.mkv").gerekli && Y.donusumKarari(aH, "x.mkv").video === "copy" &&
  Y.donusumKarari({}, "x.mp4").gerekli === false && Y.donusumKarari({}, "x.mp4").okunamadi === true && Y.donusumKarari(aM, "x.opus").gerekli === true);
var adl = Y.donusumAdlari("C:\\k\\a [" + ID + "] 4K.webm", false);
ok("dönüştürme adları: geçici .suflo-tmp.mp4 (artık sayılır), son .mp4", adl.gecici === "C:\\k\\a [" + ID + "] 4K.suflo-tmp.mp4" && adl.son === "C:\\k\\a [" + ID + "] 4K.mp4" &&
  Y.artikMi(adl.gecici) && Y.donusumAdlari("/k/a.opus", true).son === "/k/a.mp3");
var ENCODERS = "Encoders:\n V..... = Video\n A..... = Audio\n ------\n V....D a64multi             Multicolor charset\n V....D libx264              libx264 H.264 / AVC (codec h264)\n" +
  " V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)\n V..... h264_mf              H264 via MediaFoundation (codec h264)\n V.S... mpeg4                MPEG-4 part 2\n A....D aac                  AAC (Advanced Audio Coding)\n";
var kl = Y.kodlayicilar(ENCODERS);
ok("ffmpeg -encoders: yalnız video kodlayıcıları", js(kl) === js(["a64multi", "libx264", "h264_nvenc", "h264_mf", "mpeg4"]), js(kl));
ok("kodlayıcı sırası: libx264 önce; LGPL Windows'ta Media Foundation / donanım; son çare MPEG-4", js(Y.kodlayiciSec(kl, "win32")) === js(["libx264", "h264_mf", "h264_nvenc", "mpeg4"]) &&
  js(Y.kodlayiciSec(["h264_mf", "h264_qsv", "mpeg4"], "win32")) === js(["h264_mf", "h264_qsv", "mpeg4"]) && js(Y.kodlayiciSec(["h264_videotoolbox", "libx264"], "darwin")) === js(["libx264", "h264_videotoolbox"]) &&
  Y.kodlayiciSec([], "darwin").length === 0);
var dx = Y.donusumArgs({ girdi: "/k/a.webm", cikti: "/k/a.suflo-tmp.mp4", karar: kV, kodlayici: "libx264", yukseklik: 2160 });
ok("dönüştürme args: libx264 crf 18, 4K'da faster, yuv420p, AAC 192k, faststart, dizi", js(dx) === js(["-hide_banner", "-nostdin", "-y", "-i", "/k/a.webm", "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn",
  "-c:v", "libx264", "-preset", "faster", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-max_muxing_queue_size", "1024", "-movflags", "+faststart", "/k/a.suflo-tmp.mp4"]), js(dx));
var dvt = Y.donusumArgs({ girdi: "i", cikti: "o", karar: kR, kodlayici: "h264_videotoolbox", yukseklik: 1080 });
var dmf = Y.donusumArgs({ girdi: "i", cikti: "o", karar: kV, kodlayici: "h264_mf", yukseklik: 720 });
var dm4 = Y.donusumArgs({ girdi: "i", cikti: "o", karar: kV, kodlayici: "mpeg4", yukseklik: 720 });
ok("dönüştürme args: VideoToolbox bit hızı + ses kopya; MF 8M; MPEG-4 q 2", dvt.join(" ").indexOf("-c:v h264_videotoolbox -b:v 16M -allow_sw 1") !== -1 && dvt.join(" ").indexOf("-c:a copy") !== -1 &&
  dmf.join(" ").indexOf("-c:v h264_mf -b:v 8M -pix_fmt yuv420p") !== -1 && dm4.join(" ").indexOf("-c:v mpeg4 -q:v 2") !== -1);
ok("dönüştürme args: H.264 MKV → yalnız kap (copy)", Y.donusumArgs({ girdi: "i.mkv", cikti: "o.mp4", karar: Y.donusumKarari(aH, "i.mkv") }).join(" ").indexOf("-c:v copy -c:a copy") !== -1);
ok("dönüştürme args: ses dosyası", js(Y.donusumArgs({ girdi: "i.opus", cikti: "o.mp3", karar: Y.donusumKarari(aM, "x.opus") })) === js(["-hide_banner", "-nostdin", "-y", "-i", "i.opus", "-vn", "-map", "0:a:0", "-c:a", "copy", "o.mp3"]));
ok("ffmpeg zamanı: parçadaki son time=", Y.ffmpegZaman("frame=1 time=00:00:01.00 bitrate\rframe=50 time=00:01:02.50 bitrate=") === 62.5 && Y.ffmpegZaman("yok") === null && Y.ffmpegZaman("time=-00:00:00.04") === 0.04);
ok("kalan tahmini", Y.kalanTahmini(0.25, 30) === 90 && Y.kalanTahmini(0.01, 30) === null && Y.kalanTahmini(0.5, 1) === null && Y.kalanTahmini(1, 10) === 0);
ok("dönüştürme notu: libx264 yoksa kodlayıcı, MPEG-4 kalite uyarısı, HDR; libx264'te not yok", Y.donusumNotu("libx264", aV) === "" && /h264_mf/.test(Y.donusumNotu("h264_mf", aV)) &&
  /MPEG-4/.test(Y.donusumNotu("mpeg4", aV)) && /HDR/.test(Y.donusumNotu("libx264", aR)));

/* ---------------- 12) onay ---------------- */
ok("onay metni spec ile birebir", Y.ONAY_METNI === "Yalnızca indirme hakkın olan içeriği indir: kendi videoların, izin aldığın ya da lisanslı içerik. YouTube Kullanım Şartları'na uymak senin sorumluluğunda.");
ok("onay: ayarlarda sürümle hatırlanır", Y.onayVarMi({ ytOnay: 1 }) && !Y.onayVarMi({}) && !Y.onayVarMi(null) && !Y.onayVarMi({ ytOnay: 0 }));

/* ---------------- 13) UMD + İngilizce arayüz ---------------- */
var ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(KOK, "js", "youtube-indir.js"), "utf8"), ctx);
ok("UMD: tarayıcıda window.SufloYoutubeIndir", !!ctx.window.SufloYoutubeIndir && typeof ctx.window.SufloYoutubeIndir.urlCoz === "function");

var I18N = require(path.join(KOK, "js", "i18n.js"));
I18N.setDictionary(require(path.join(KOK, "i18n", "en.js")));
var TR_IZ = /[ıİşŞğĞçÇöÖüÜ]|\b(ve|bir|bu|kaldı|indir|dk|sn|sa|gündür|kurulu|güncel|hazır)\b/;
var metinler = [];
function topla(o) { Object.keys(o).forEach(function (k) { metinler.push(typeof o[k] === "string" ? o[k] : o[k].mesaj); }); }
topla(Y.URL_HATA); topla(Y.HATALAR); topla(Y.ASAMA_METNI);
["is_live", "is_upcoming", "post_live"].forEach(function (c) { metinler.push(Y.canliEngeli({ canli: c })); });
["ozetYok", "listedeYok", "apiCeliski", "uyusmadi"].forEach(function (k) { metinler.push(Y.dogrulamaMesaji(k)); });
dr.forEach(function (d) { metinler.push(d.title, d.detail); });
metinler.push(Y.klasorNotu("darwin"), Y.klasorNotu("win32"));
metinler.push(Y.JS_YOK_METNI, Y.ONAY_METNI, Y.guncellemeIpucu(eskiMeta, SIMDI).metin, Y.donusumNotu("h264_mf", aR), Y.donusumNotu("mpeg4", aV),
  Y.ilerlemeMetni({ asama: "indir", oran: 0.45, hiz: 4404019, eta: 80 }), Y.ilerlemeMetni({ asama: "donustur", oran: 0.3, eta: 3900 }),
  Y.ilerlemeMetni({ asama: "kur", oran: 0.1, hiz: 2048, eta: 7 }), Y.ilerlemeMetni({ asama: "ice", oran: 1 }));
var cevrilmeyen = metinler.filter(function (m) { var e = I18N.translate(m); return !e || e === m || TR_IZ.test(e); });
ok("İngilizce arayüz: modülün her kullanıcı metni çevrilir (" + metinler.length + " metin)", cevrilmeyen.length === 0, cevrilmeyen.join(" | "));

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
