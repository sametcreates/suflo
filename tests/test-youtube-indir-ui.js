// Suflo testi: js/youtube-indir-ui.js — YouTube indirici paneli (sahte DOM, sahte köprü, sahte Pro, gerçek dosya sistemi)
//  - açılışta Premiere / ağ / süreç yok; sekme açılınca yalnız KS_projectDir
//  - yt-dlp ilk kullanımda: SHA2-256SUMS + ikili aynı sürümden, özet tutmadan çalıştırılmaz, chmod doğrulamadan sonra;
//    tutmazsa dosya silinir; oturumda doğrulanmış ikili yeniden indirilmez; kurcalanmış ikili çalıştırılmaz
//  - Bilgi al ücretsiz (kapı yok); İndir: tek seferlik onay (ayarda hatırlanır) → Pro.gate("youtube", deneme) →
//    hak yalnız dosya hazır olunca ve bir kez
//  - indirme argümanları (dizi, süreç grubu, ffmpeg yolu, vekil), ilerleme, Premiere'e ekleme, Klasörde göster
//  - 4K VP9 → H.264 (libx264 yoksa sıradaki kodlayıcı), İptal ve hata temizliği, Güncelle, Doctor satırları
//  - köprü: surecGrubu macOS'ta ayrı süreç grubu, iptalde tüm grup (eksi pid) öldürülür
var fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm"), crypto = require("crypto");
var EventEmitter = require("events");
var KOK = path.join(__dirname, "..");
var Y = require(path.join(KOK, "js", "youtube-indir.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { try { return JSON.stringify(x); } catch (e) { return String(x); } }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms || 5); }); }
function sha(b) { return crypto.createHash("sha256").update(b).digest("hex"); }

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-yt-"));
var ID = "dQw4w9WgXcQ";
var URL1 = "https://youtu.be/" + ID + "?si=abc";
var IKILI = Buffer.from("SAHTE-YT-DLP-2026.08.19\n");
var YENI_IKILI = Buffer.from("SAHTE-YT-DLP-2026.10.01\n");

function eleman(tag, id) {
  var x = { tagName: String(tag || "div").toUpperCase(), id: id || "", children: [], className: "", disabled: false, hidden: false, value: "", checked: false,
    type: "", style: {}, _o: {}, _a: {}, _text: "", src: "" };
  Object.defineProperty(x, "textContent", {
    get: function () { return x.children.length ? x.children.map(function (c) { return c.textContent; }).join("") : x._text; },
    set: function (v) { x._text = String(v); x.children = []; }
  });
  x.appendChild = function (c) { x.children.push(c); return c; };
  x.addEventListener = function (t, fn) { x._o[t] = fn; };
  x.setAttribute = function (k, v) { x._a[k] = String(v); };
  x.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(x._a, k) ? x._a[k] : null; };
  x.removeAttribute = function (k) { delete x._a[k]; if (k === "src") x.src = ""; };
  x.focus = function () {}; x.select = function () {};
  var sinif = {};
  x.classList = {
    add: function (c) { sinif[c] = 1; }, remove: function (c) { delete sinif[c]; }, contains: function (c) { return !!sinif[c]; },
    toggle: function (c, on) { if (on === undefined ? !sinif[c] : on) sinif[c] = 1; else delete sinif[c]; }
  };
  return x;
}
function tikla(dom, id) { var f = dom[id]._o.click; return f ? f({ detail: 1 }) : undefined; }

var IDLER = ["tab-youtube", "yt-tanitim", "yt-url", "yt-yapistir", "yt-bilgi", "yt-onizleme", "yt-kucuk", "yt-baslik", "yt-kanal", "yt-sure",
  "yt-k-mp3", "yt-k-720", "yt-k-1080", "yt-k-2160", "yt-kalite-not", "yt-klasor-yol", "yt-klasor-ipucu", "yt-klasor-not", "yt-klasor-degistir",
  "yt-klasor-varsayilan", "yt-indir", "yt-iptal", "yt-ilerleme", "yt-ilerleme-cubuk", "yt-durum", "yt-js-not", "yt-guncelle-kutu",
  "yt-guncelle-metin", "yt-guncelle", "yt-sonuc", "yt-klasorde-goster", "yt-onay", "yt-onay-cb", "yt-onay-tamam", "yt-onay-vazgec"];

// -J çıktısı: 4K VP9 + 1080p H.264 + m4a
function jCikti(o) {
  o = o || {};
  return JSON.stringify({
    id: ID, title: "Deneme / videosu: başlık?", channel: "Suflo Kanal", duration: 10, live_status: o.canli || "not_live",
    thumbnail: "https://i.ytimg.com/vi/" + ID + "/maxresdefault.jpg",
    formats: [
      { format_id: "140", vcodec: "none", acodec: "mp4a.40.2", ext: "m4a", filesize: 160000 },
      { format_id: "137", vcodec: "avc1.640028", acodec: "none", ext: "mp4", width: 1920, height: 1080, format_note: "1080p", filesize: 2000000 },
      { format_id: "313", vcodec: "vp9", acodec: "none", ext: "webm", width: 3840, height: 2160, format_note: "2160p", filesize: 9000000 }
    ].slice(0, o.en1080 ? 2 : 3)
  });
}
var H264 = "Input #0, mov,mp4: from 'x':\n  Duration: 00:00:10.00, start: 0.000000\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 25 fps\n  Stream #0:1[0x2](und): Audio: aac (LC), 44100 Hz, stereo\n";
var VP9 = "Input #0, mov,mp4: from 'x':\n  Duration: 00:00:10.00, start: 0.000000\n  Stream #0:0[0x1](und): Video: vp9 (Profile 0) (vp09 / 0x39307076), yuv420p(tv, bt709), 3840x2160, 25 fps\n  Stream #0:1[0x2](und): Audio: aac (LC), 44100 Hz, stereo\n";
var ENCODERS = "Encoders:\n V..... = Video\n ------\n V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)\n V..... h264_mf              H264 via MediaFoundation (codec h264)\n V.S... mpeg4                MPEG-4 part 2\n";

/*
 * o: { platform, pro, kurulu (deneme kurulu), proje, sumsBozuk, apiEtiket, ikili, cevapJ, indirmeHata, indirmeIptal,
 *      akis, kodlayiciHata: [adlar], projeYok, ayar,
 *      donusumdeIptal (İptal ffmpeg dönüştürmesi başlayınca), yoklamadaIptal (İptal ffmpeg -i yoklamasında),
 *      icedeIptalDene (KS_importDownloaded sırasında İptal'e basılır) }
 */
function kur(o) {
  o = o || {};
  var dom = {};
  IDLER.forEach(function (id) { dom[id] = eleman(/^yt-k-/.test(id) ? "button" : "div", id); });
  dom["yt-onay"].hidden = true; dom["yt-sonuc"].hidden = true; dom["yt-onizleme"].hidden = true; dom["yt-guncelle-kutu"].hidden = true; dom["yt-ilerleme"].hidden = true;
  dom["yt-onay-cb"].type = "checkbox";
  var ev = o.ev || fs.mkdtempSync(path.join(TMP, "ev-"));   // o.ev: aynı kurulumda yeni oturum
  var proje = path.join(ev, "Projeler", "Düğün");
  fs.mkdirSync(proje, { recursive: true });
  var ayar = o.ayar || {};
  var c = { call: [], run: [], download: [], http: [], toast: [], kapi: [], harca: [], kaydet: 0, calisanOzet: [], acilisCall: 0 };
  var platform = o.platform || "darwin";
  var exeAd = platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  var ytdir = path.join(ev, "Suflo", "yt-dlp");
  var exe = path.join(ytdir, exeAd);
  var ikili = o.ikili || IKILI;
  var varlik = platform === "win32" ? "yt-dlp.exe" : "yt-dlp_macos";
  function jeton() {
    var dinleyici = [];
    var j = { iptalEdildi: false, iptal: function () { if (j.iptalEdildi) return; j.iptalEdildi = true; dinleyici.splice(0).forEach(function (f) { f(); }); },
      dinle: function (f) { if (j.iptalEdildi) { f(); return function () {}; } dinleyici.push(f); return function () { var i = dinleyici.indexOf(f); if (i !== -1) dinleyici.splice(i, 1); }; } };
    c.sonJeton = j;
    return j;
  }
  function argDeger(a, b) { var i = a.indexOf(b); return i === -1 ? undefined : a[i + 1]; }
  var K = {
    nodeOK: true, MAC: platform === "darwin", WIN: platform === "win32", path: path,
    // o.silinemez: adı bu kalıba uyan dosya silinemez (Windows'ta kilitli dosya gibi)
    fs: o.silinemez ? Object.assign(Object.create(fs), { unlinkSync: function (p) {
      if (o.silinemez.test(String(p))) { var eB = new Error("EBUSY: resource busy or locked"); eB.code = "EBUSY"; throw eB; }
      return fs.unlinkSync(p);
    } }) : fs,
    rmrf: function (p) { c.rmrf = (c.rmrf || []).concat([path.basename(p)]); fs.rmSync(p, { recursive: true, force: true }); },
    os: { arch: function () { return "arm64"; }, homedir: function () { return ev; } },
    whisperDir: function () { return path.join(ev, "Suflo", "whisper"); },
    settings: function () { return ayar; }, saveSettings: function () { c.kaydet++; return true; },
    log: function () {}, hataYardimi: function (e) { return String(e && e.message ? e.message : e); },
    iptalJetonu: jeton, iptalHatasi: function (m) { var e = new Error(m || "İptal edildi"); e.iptal = true; return e; },
    iptalTikiGecerli: function () { return true; }, baslatTikiGecerli: function () { return true; },
    findFfmpeg: function () { return Promise.resolve(o.ffmpeg === undefined ? "/opt/homebrew/bin/ffmpeg" : o.ffmpeg); },
    httpGet: function (u) {
      c.http.push(u);
      if (o.apiYok) return Promise.resolve({ status: 0, body: "getaddrinfo ENOTFOUND" });
      return Promise.resolve({ status: 200, body: JSON.stringify({ tag_name: o.apiEtiket || "2026.08.19", assets: [] }) });
    },
    download: function (url, hedef, ilerle, r1, r2, meta) {
      c.download.push({ url: url, hedef: hedef, meta: meta });
      if (meta && meta.iptal && meta.iptal.iptalEdildi) return Promise.resolve({ ok: false, iptal: true });
      if (/SHA2-256SUMS$/.test(url)) {
        var oz = o.sumsBozuk ? "ab".repeat(32) : sha(o.yeniSurum ? YENI_IKILI : ikili);
        fs.writeFileSync(hedef, oz + "  " + varlik + "\n" + "cd".repeat(32) + "  yt-dlp_linux\n");
      } else {
        if (ilerle) { ilerle(0.5); ilerle(1); }
        fs.writeFileSync(hedef, o.yeniSurum ? YENI_IKILI : ikili);
      }
      return Promise.resolve({ ok: true });
    },
    call: function (fn, arg) {
      c.call.push({ fn: fn, arg: arg });
      if (fn === "KS_projectDir") return Promise.resolve(o.projeYok ? { ok: true, dir: "" } : { ok: true, dir: proje });
      if (fn === "KS_importDownloaded") {
        // ekleme adımı yarıda kesilemez: İptal görünür ama kapalı, basılsa da iş iptal olmaz
        c.iceIptal = { hidden: dom["yt-iptal"].hidden, disabled: dom["yt-iptal"].disabled };
        if (o.icedeIptalDene) { dom["yt-iptal"]._o.click({ detail: 1 }); c.iceSonrasiIptal = !!(c.sonJeton && c.sonJeton.iptalEdildi); }
        return Promise.resolve(o.iceAlma || { ok: true, imported: true, reused: false, selected: true, bin: arg.bin, name: path.basename(arg.path) });
      }
      return Promise.resolve({ ok: false, error: "?" });
    },
    run: function (cmd, args, opts) {
      opts = opts || {};
      var kayit = { cmd: cmd, args: args.slice(), opts: { surecGrubu: !!opts.surecGrubu, timeout: opts.timeout, iptal: !!opts.iptal, env: opts.env, cwd: opts.cwd } };
      c.run.push(kayit);
      if (cmd === exe) {
        // ikili çalıştırıldığı anda diskteki özet: yalnız doğrulanmış dosya çalışmalı
        c.calisanOzet.push(sha(fs.readFileSync(exe)));
        if (args[0] === "--version") return Promise.resolve({ code: o.surumHata ? 1 : 0, stdout: o.surumHata ? "" : (o.yeniSurum ? "2026.10.01\n" : "2026.08.19\n"), stderr: o.surumHata ? "[PYI-1:ERROR] Failed to execute script" : "" });
        if (args.indexOf("-J") !== -1) {
          c.bilgiIptal = { hidden: dom["yt-iptal"].hidden, disabled: dom["yt-iptal"].disabled };
          if (o.bilgiHata) return Promise.resolve({ code: 1, stdout: "", stderr: o.bilgiHata });
          return Promise.resolve({ code: 0, stdout: jCikti(o.j), stderr: o.jsYok ? "WARNING: [youtube] No supported JavaScript runtime could be found." : "" });
        }
        // indirme: gerçek yt-dlp gibi göreli -o çalışma klasörüne (cwd) iner; -P verilmez
        if (args.indexOf("-P") !== -1 || !opts.cwd) return Promise.resolve({ code: 1, stdout: "", stderr: "SAHTE: -P verildi ya da cwd yok" });
        var klasor = opts.cwd, sablon = argDeger(args, "-o");
        var etiket = (/\] ([A-Za-z0-9]+)\.%\(ext\)s$/.exec(sablon) || [])[1];
        var ext = argDeger(args, "--audio-format") || "mp4";
        var ad = "Deneme ⧸ videosu： başlık？ [" + ID + "]" + (etiket ? " " + etiket : "") + "." + ext;
        var parca = path.join(klasor, ad.replace(/\.[a-z0-9]+$/, ".f137.mp4.part"));
        fs.writeFileSync(parca, "yarim");
        var satirlar = ["SUFLOP downloading 1024 2000000 NA 1048576 2 137", "SUFLOP downloading 1000000 2000000 NA 1048576 1 137", "SUFLOP finished 2000000 2000000 NA 1048576 0 137",
          "SUFLOP finished 160000 160000 NA 1048576 0 140", "SUFLOPP started Merger"];
        var metin = satirlar.join("\n") + "\n";
        if (opts.onStdout) { opts.onStdout(metin.slice(0, 37)); opts.onStdout(metin.slice(37, 120)); opts.onStdout(metin.slice(120)); }
        if (o.indirmeIptal) {
          opts.iptal.iptal();
          return Promise.resolve({ code: -2, iptal: true, stdout: metin, stderr: "" });
        }
        if (o.indirmeHata) return Promise.resolve({ code: 1, stdout: metin, stderr: o.indirmeHata });
        fs.unlinkSync(parca);
        var son = path.join(klasor, ad);
        fs.writeFileSync(son, "video");
        var yol = "SUFLOF " + JSON.stringify(o.goreliYol ? ad : son).replace(/[\u007f-\uffff]/g, function (ch) { return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4); }) + "\n";
        if (opts.onStdout) opts.onStdout(yol);
        if (opts.onStderr) opts.onStderr("SUFLOPP finished Merger\n");
        return Promise.resolve({ code: 0, stdout: metin + yol, stderr: o.jsYok ? "WARNING: No supported JavaScript runtime could be found" : "" });
      }
      if (/ffmpeg$/.test(cmd)) {
        if (args.indexOf("-encoders") !== -1) return Promise.resolve({ code: 0, stdout: ENCODERS, stderr: "" });
        if (args.length === 3 && args[1] === "-i") {
          if (o.yoklamadaIptal && opts.iptal) { opts.iptal.iptal(); return Promise.resolve({ code: -2, iptal: true, stdout: "", stderr: "" }); }
          return Promise.resolve({ code: 1, stdout: "", stderr: o.akis || H264 });
        }
        var cikti = args[args.length - 1], enc = argDeger(args, "-c:v");
        if (o.donusumdeIptal && opts.iptal) {
          // kodlama başladı, geçici dosya yarım yazıldı; kullanıcı İptal'e basar (köprü süreci öldürüp iptal döner)
          fs.writeFileSync(cikti, "yarim-h264");
          c.donusumGecici = cikti;
          opts.iptal.iptal();
          return Promise.resolve({ code: -2, iptal: true, stdout: "", stderr: "" });
        }
        if (opts.onStderr) { opts.onStderr("frame=1 time=00:00:02.50 bitrate=1\r"); opts.onStderr("frame=2 time=00:00:05.00 bitrate=1\r"); c.donusumDurum = dom["yt-durum"].textContent; c.donusumCubuk = dom["yt-ilerleme-cubuk"].style.width; }
        if ((o.kodlayiciHata || []).indexOf(enc) !== -1) return Promise.resolve({ code: 1, stdout: "", stderr: "Error while opening encoder " + enc });
        fs.writeFileSync(cikti, "h264");
        c.donusum = (c.donusum || []).concat([enc]);
        return Promise.resolve({ code: 0, stdout: "", stderr: "" });
      }
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    }
  };
  var dinleyici = {};
  var ctx = {
    window: { SufloYoutubeIndir: Y },
    document: { getElementById: function (id) { return dom[id] || null; }, createElement: function (t) { return eleman(t); }, createTextNode: function (t) { return { nodeType: 3, textContent: String(t) }; },
      execCommand: function () { return false; } },
    navigator: {},
    K: K,
    KApp: { toast: function (m, t) { c.toast.push([m, t]); }, onTab: function (ad, fn) { dinleyici[ad] = fn; } },
    KEngine: { installFfmpeg: function () { c.ffmpegKurulum = true; return Promise.resolve("/x/ffmpeg"); } },
    Pro: {
      isPro: function () { return !!o.pro; },
      gate: function (f, op) { c.kapi.push([f, op]); return !!o.pro || !!o.kurulu; },
      // gerçek pro.js gibi: Pro'da hak harcanmaz (-1)
      denemeHarca: function (f, bildir) { if (o.pro) return -1; c.harca.push(f); bildir("1 deneme hakkı kullanıldı · 2 kaldı", "good"); return 2; }
    },
    process: { platform: platform },
    require: require, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise, console: console, Date: Date, Buffer: Buffer
  };
  ctx.window.KApp = ctx.KApp; ctx.window.KEngine = ctx.KEngine;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "youtube-indir-ui.js"), "utf8"), ctx);
  var KY = ctx.window.KYoutube;
  KY.init();
  return { KY: KY, dom: dom, c: c, K: K, ayar: ayar, ev: ev, proje: proje, exe: exe, ytdir: ytdir, dinleyici: dinleyici,
    durum: function () { return dom["yt-durum"].textContent; },
    ytCalismalari: function () { return c.run.filter(function (r) { return r.cmd === exe; }); } };
}
function hedefKlasor(t) { return path.join(t.proje, "Suflo İndirilenler"); }

(async function () {
  /* ---------- 1) açılış: Premiere / ağ / süreç yok ---------- */
  var a = kur();
  ok("açılışta K.call / K.run / indirme / ağ yok", a.c.call.length === 0 && a.c.run.length === 0 && a.c.download.length === 0 && a.c.http.length === 0, js(a.c));
  ok("açılışta İndir kapalı, İptal gizli, çipler kapalı", a.dom["yt-indir"].disabled === true && a.dom["yt-iptal"].hidden === true &&
    ["mp3", "720", "1080", "2160"].every(function (k) { return a.dom["yt-k-" + k].disabled; }));
  a.dinleyici.youtube();
  await bekle(10);
  ok("sekme açılınca yalnız KS_projectDir; varsayılan klasör proje yanında", a.c.call.length === 1 && a.c.call[0].fn === "KS_projectDir" &&
    a.dom["yt-klasor-yol"].textContent === hedefKlasor(a) && a.dom["yt-klasor-ipucu"].hidden === true && a.c.run.length === 0, js([a.c.call, a.dom["yt-klasor-yol"].textContent]));

  /* ---------- 2) geçersiz bağlantı ---------- */
  a.dom["yt-url"].value = "https://vimeo.com/123";
  await tikla(a.dom, "yt-bilgi");
  ok("geçersiz bağlantı: dostça mesaj, süreç / indirme yok", /Yalnız YouTube/.test(a.durum()) && a.c.run.length === 0 && a.c.download.length === 0, a.durum());

  /* ---------- 3) Bilgi al: ilk kullanımda doğrulanmış kurulum ---------- */
  a.dom["yt-url"].value = URL1;
  await tikla(a.dom, "yt-bilgi");
  var indirilenler = a.c.download.map(function (d) { return d.url; });
  ok("ilk kullanım: SUMS ve ikili AYNI sürümden (API etiketi)", indirilenler[0] === "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/SHA2-256SUMS" &&
    indirilenler[1] === "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_macos" && indirilenler.length === 2, js(indirilenler));
  ok("ikili önce çalıştırılamayan geçici ada iner", /yt-dlp_macos\.dogrulanmadi$/.test(a.c.download[1].hedef) && !fs.existsSync(a.c.download[1].hedef));
  ok("doğrulanmış ikili yerinde, 0755, kayıt yazıldı", fs.existsSync(a.exe) && (process.platform === "win32" || (fs.statSync(a.exe).mode & 511) === 493) &&
    JSON.parse(fs.readFileSync(path.join(a.ytdir, "suflo-ytdlp.json"), "utf8")).sha256 === sha(IKILI));
  var ytc = a.ytCalismalari();
  ok("ilk çalıştırma --version, sonra -J; her çalıştırmada dosya doğrulanmış özetle aynı", ytc[0].args[0] === "--version" && ytc[1].args.indexOf("-J") !== -1 &&
    a.c.calisanOzet.every(function (h) { return h === sha(IKILI); }), js(ytc.map(function (r) { return r.args[0]; })));
  ok("macOS karantina temizliği doğrulamadan sonra", a.c.run.some(function (r) { return r.cmd === "/usr/bin/xattr" && r.args[r.args.length - 1] === a.exe; }));
  ok("-J: kanonik adres, --no-playlist, --ignore-config, süreç grubu", js(ytc[1].args) === js(Y.bilgiArgs("https://www.youtube.com/watch?v=" + ID, {})) && ytc[1].opts.surecGrubu === true, js(ytc[1].args));
  ok("Bilgi al ücretsiz: kapı çağrılmaz, hak düşmez", a.c.kapi.length === 0 && a.c.harca.length === 0);
  ok("önizleme: başlık, kanal, süre, küçük resim (başlık çevrilmez kaba yazılır)", a.dom["yt-onizleme"].hidden === false && a.dom["yt-baslik"].textContent === "Deneme / videosu: başlık?" &&
    a.dom["yt-kanal"].textContent === "Suflo Kanal" && a.dom["yt-sure"].textContent === "0:10" && a.dom["yt-kucuk"].src === "https://i.ytimg.com/vi/" + ID + "/maxresdefault.jpg");
  ok("çipler: dördü açık, varsayılan 1080p seçili", ["mp3", "720", "1080", "2160"].every(function (k) { return !a.dom["yt-k-" + k].disabled; }) &&
    a.dom["yt-k-1080"].classList.contains("on") && a.dom["yt-k-1080"].getAttribute("aria-checked") === "true" && a.dom["yt-indir"].disabled === false);
  ok("durum: kalite seç", /Kaliteyi seç/.test(a.durum()) && a.dom["yt-iptal"].hidden === true);

  /* ---------- 4) İndir: onay → kapı ---------- */
  await tikla(a.dom, "yt-indir");
  ok("ilk İndir: onay penceresi, kapı yok, süreç yok", a.dom["yt-onay"].hidden === false && a.c.kapi.length === 0 && a.dom["yt-onay-tamam"].disabled === true &&
    a.ytCalismalari().length === 2);
  tikla(a.dom, "yt-onay-tamam");
  ok("kutu işaretlenmeden Devam et çalışmaz", a.dom["yt-onay"].hidden === false && !a.ayar.ytOnay);
  a.dom["yt-onay-cb"].checked = true; a.dom["yt-onay-cb"]._o.change();
  ok("kutu işaretlenince Devam et açılır", a.dom["yt-onay-tamam"].disabled === false);
  tikla(a.dom, "yt-onay-tamam");
  await bekle(20);
  ok("onay ayarda hatırlanır, pencere kapanır, ardından kapı 'youtube' + deneme + yeniden", a.ayar.ytOnay === 1 && a.dom["yt-onay"].hidden === true && a.c.kapi.length === 1 &&
    a.c.kapi[0][0] === "youtube" && a.c.kapi[0][1].deneme === true && typeof a.c.kapi[0][1].yeniden === "function", js(a.c.kapi));
  ok("kapı geçmeyince indirme başlamaz, hak düşmez", a.ytCalismalari().length === 2 && a.c.harca.length === 0);
  await tikla(a.dom, "yt-indir");
  ok("onay bir kez: ikinci İndir'de pencere yok, doğrudan kapı", a.dom["yt-onay"].hidden === true && a.c.kapi.length === 2);

  /* ---------- 5) deneme kurulu: indir, Premiere'e ekle, hak bir kez ---------- */
  var b = kur({ kurulu: true, ayar: { ytOnay: 1, proxyUrl: "vekil.local:3128" } });
  b.dom["yt-url"].value = URL1;
  await tikla(b.dom, "yt-bilgi");
  var indirmeOncesi = b.c.download.length;
  await tikla(b.dom, "yt-indir");
  var ind = b.ytCalismalari().filter(function (r) { return r.args.indexOf("-J") === -1 && r.args[0] !== "--version"; })[0];
  ok("indirme: oturumda doğrulanmış ikili yeniden indirilmez", b.c.download.length === indirmeOncesi);
  ok("indirme argümanları: dizi, süreç grubu, uzun zaman aşımı, kanonik adres en sonda", !!ind && ind.opts.surecGrubu && ind.opts.iptal && ind.opts.timeout >= 3600000 &&
    ind.args[ind.args.length - 1] === "https://www.youtube.com/watch?v=" + ID && ind.args[ind.args.length - 2] === "--", js(ind && ind.args));
  function deger(a, b2) { var i = a.indexOf(b2); return i === -1 ? undefined : a[i + 1]; }
  ok("indirme: yt-dlp hedef klasörde (proje yanında) çalışır, klasör argümanda yok (-P yok), ffmpeg yolu, vekil, 1080p biçimi",
    ind.opts.cwd === hedefKlasor(b) && ind.args.indexOf("-P") === -1 && ind.args.every(function (x) { return x.indexOf(hedefKlasor(b)) === -1; }) &&
    deger(ind.args, "--ffmpeg-location") === "/opt/homebrew/bin/ffmpeg" &&
    deger(ind.args, "--proxy") === "http://vekil.local:3128" && deger(ind.args, "-f") === Y.formatSecici("1080") && deger(ind.args, "-o") === "%(title).150B [%(id)s] 1080p.%(ext)s", js(ind.args));
  var dosya = path.join(hedefKlasor(b), "Deneme ⧸ videosu： başlık？ [" + ID + "] 1080p.mp4");
  ok("dosya indi (yol --print'ten, Unicode kaçışı çözüldü), yarım dosya kalmadı", fs.existsSync(dosya) && fs.readdirSync(hedefKlasor(b)).length === 1, js(fs.readdirSync(hedefKlasor(b))));
  var ice = b.c.call.filter(function (x) { return x.fn === "KS_importDownloaded"; });
  ok("Premiere'e 'Suflo İndirilenler' kutusuyla eklendi", ice.length === 1 && ice[0].arg.path === dosya && ice[0].arg.bin === "Suflo İndirilenler", js(ice));
  ok("H.264/AAC: dönüştürme yok", !b.c.donusum);
  ok("hak bir kez, dosya hazır olunca düştü ve bildirildi", js(b.c.harca) === js(["youtube"]) && b.c.toast.some(function (t) { return /deneme hakkı kullanıldı/.test(t[0]); }));
  ok("sonuç: dosya adı çevrilmez düğümde, Klasörde göster görünür, İndir geri geldi", /İndirildi ve Premiere'e eklendi/.test(b.durum()) &&
    b.dom["yt-durum"].children[0].children.some(function (n) { return n.getAttribute && n.getAttribute("data-i18n-skip") === "" && n.textContent === path.basename(dosya); }) &&
    b.dom["yt-sonuc"].hidden === false && b.dom["yt-indir"].hidden === false && b.dom["yt-iptal"].hidden === true && b.dom["yt-ilerleme"].hidden === true, b.durum());
  ok("ilerleme çubuğu indirme sırasında kullanıldı", /%$/.test(b.dom["yt-ilerleme-cubuk"].style.width || ""), b.dom["yt-ilerleme-cubuk"].style.width);
  await tikla(b.dom, "yt-klasorde-goster");
  var goster = b.c.run.filter(function (r) { return r.cmd === "/usr/bin/open"; })[0];
  ok("Klasörde göster: macOS open -R <dosya> (dizi)", goster && js(goster.args) === js(["-R", dosya]));
  ok("seçilen kalite ayarda hatırlanır", b.KY._durum().kalite === "1080");
  b.KY.kaliteSec("2160");
  ok("çip seçimi kaydedilir, 4K notu gösterilir", b.ayar.ytKalite === "2160" && /4K/.test(b.dom["yt-kalite-not"].textContent));

  /* ---------- 6) 4K VP9 → H.264 (libx264 yok: Windows MF başarısız, NVENC) ---------- */
  var w = kur({ platform: "win32", pro: true, ayar: { ytOnay: 1, ytKalite: "2160" }, akis: VP9, kodlayiciHata: ["h264_mf"] });
  w.dom["yt-url"].value = URL1;
  await tikla(w.dom, "yt-bilgi");
  ok("Windows: yt-dlp.exe (arm64 listede yoksa x64), chmod yok", /download\/2026\.08\.19\/yt-dlp\.exe$/.test(w.c.download[1].url) && fs.existsSync(w.exe));
  ok("Windows: kayıtlı 4K tercihi seçili", w.dom["yt-k-2160"].classList.contains("on"));
  await tikla(w.dom, "yt-indir");
  var son4k = path.join(hedefKlasor(w), "Deneme ⧸ videosu： başlık？ [" + ID + "] 4K.mp4");
  ok("Pro: kapı geçer, hak düşmez", w.c.harca.length === 0 && w.c.kapi.length === 1);
  ok("4K VP9: Media Foundation başarısız → NVENC ile H.264, aynı ada yazıldı, geçici dosya yok", js(w.c.donusum) === js(["h264_nvenc"]) && fs.readFileSync(son4k, "utf8") === "h264" &&
    fs.readdirSync(hedefKlasor(w)).length === 1, js([w.c.donusum, fs.readdirSync(hedefKlasor(w))]));
  ok("dönüştürme notu: libx264 yok, kullanılan kodlayıcı", /libx264 yok/.test(w.durum()) && /h264_nvenc/.test(w.durum()), w.durum());
  ok("4K dönüştürme ilerlemesi: yüzde, çubuk ve 'uzun sürer' notu", /^Premiere için H\.264'e dönüştürülüyor… · %50( · [^·]+)? · 4K dönüştürme uzun sürer$/.test(w.c.donusumDurum) && w.c.donusumCubuk === "50%", js([w.c.donusumDurum, w.c.donusumCubuk]));
  ok("Windows: içe alınan yol dönüştürülmüş MP4", w.c.call.filter(function (x) { return x.fn === "KS_importDownloaded"; })[0].arg.path === son4k);

  /* ---------- 7) İptal: yarım dosyalar silinir, önceki tam dosya kalır, hak düşmez ---------- */
  var ip = kur({ kurulu: true, ayar: { ytOnay: 1 }, indirmeIptal: true });
  fs.mkdirSync(hedefKlasor(ip), { recursive: true });
  var eskiTam = path.join(hedefKlasor(ip), "Eski [" + ID + "] 720p.mp4");
  var eskiYarim = path.join(hedefKlasor(ip), "Eski [" + ID + "] 720p.mp4.part");
  var baska = path.join(hedefKlasor(ip), "Başka [AAAAAAAAAAA].mp4.part");
  fs.writeFileSync(eskiTam, "tam"); fs.writeFileSync(eskiYarim, "y"); fs.writeFileSync(baska, "b");
  ip.dom["yt-url"].value = URL1;
  await tikla(ip.dom, "yt-bilgi");
  await tikla(ip.dom, "yt-indir");
  await bekle(20);
  var kalan = fs.readdirSync(hedefKlasor(ip)).sort();
  ok("İptal: bu indirmenin yarımları ve videonun eski yarımı silindi; eski tam dosya ve başka video kaldı",
    js(kalan) === js([path.basename(baska), path.basename(eskiTam)].sort()), js(kalan));
  ok("İptal: hak düşmez, Premiere'e eklenmez, durum İptal", ip.c.harca.length === 0 && !ip.c.call.some(function (x) { return x.fn === "KS_importDownloaded"; }) && /İptal edildi/.test(ip.durum()), ip.durum());

  /* ---------- 7b) Pro: dönüştürme sırasında İptal: indirilen tam dosya KALIR, yalnız geçici ve yarımlar gider ---------- */
  var dc = kur({ pro: true, ayar: { ytOnay: 1, ytKalite: "2160" }, akis: VP9, donusumdeIptal: true });
  fs.mkdirSync(hedefKlasor(dc), { recursive: true });
  var dcEskiYarim = path.join(hedefKlasor(dc), "Eski [" + ID + "] 4K.f313.webm.part");
  fs.writeFileSync(dcEskiYarim, "y");
  dc.dom["yt-url"].value = URL1;
  await tikla(dc.dom, "yt-bilgi");
  await tikla(dc.dom, "yt-indir");
  var dcTam = path.join(hedefKlasor(dc), "Deneme ⧸ videosu： başlık？ [" + ID + "] 4K.mp4");
  ok("dönüştürmede İptal: indirilen 4K dosya klasörde durur (silinmez), .suflo-tmp ve eski yarım silinir",
    !!dc.c.donusumGecici && /\.suflo-tmp\.mp4$/.test(dc.c.donusumGecici) && fs.existsSync(dcTam) && fs.readFileSync(dcTam, "utf8") === "video" &&
    js(fs.readdirSync(hedefKlasor(dc))) === js([path.basename(dcTam)]), js(fs.readdirSync(hedefKlasor(dc))));
  ok("Pro, dönüştürmede İptal: durum doğru söyler (dosya duruyor, eklenmedi), Klasörde göster açık, hak düşmez, Premiere'e eklenmez",
    /^Dönüştürme iptal edildi\. İndirilen dosya klasörde duruyor, Premiere'e eklenmedi: /.test(dc.durum()) && dc.durum().indexOf(path.basename(dcTam)) !== -1 &&
    !/Yarım dosyalar silindi/.test(dc.durum()) && dc.dom["yt-sonuc"].hidden === false && dc.KY._durum().sonDosya === dcTam &&
    dc.c.harca.length === 0 && !dc.c.call.some(function (x) { return x.fn === "KS_importDownloaded"; }) &&
    dc.dom["yt-indir"].hidden === false && dc.dom["yt-iptal"].hidden === true, dc.durum());
  await tikla(dc.dom, "yt-klasorde-goster");
  ok("dönüştürmede İptal: Klasörde göster korunan dosyayı seçer", dc.c.run.some(function (r) { return r.cmd === "/usr/bin/open" && js(r.args) === js(["-R", dcTam]); }));

  /* ---------- 7c) Pro: indirme bitti, codec yoklamasında İptal: dosya kalır, eklenmez, hak düşmez ---------- */
  var yk = kur({ pro: true, ayar: { ytOnay: 1 }, yoklamadaIptal: true });
  yk.dom["yt-url"].value = URL1;
  await tikla(yk.dom, "yt-bilgi");
  await tikla(yk.dom, "yt-indir");
  var ykTam = path.join(hedefKlasor(yk), "Deneme ⧸ videosu： başlık？ [" + ID + "] 1080p.mp4");
  var ykYokla = yk.c.run.filter(function (r) { return /ffmpeg$/.test(r.cmd) && r.args.length === 3 && r.args[1] === "-i"; })[0];
  ok("yoklamada İptal: ffmpeg -i iptal jetonuyla çalışır; tam dosya kalır; eklenmez; hak düşmez",
    !!ykYokla && ykYokla.opts.iptal === true && fs.existsSync(ykTam) && js(fs.readdirSync(hedefKlasor(yk))) === js([path.basename(ykTam)]) &&
    yk.c.harca.length === 0 && !yk.c.call.some(function (x) { return x.fn === "KS_importDownloaded"; }) && !yk.c.donusum &&
    /^İptal edildi\. İndirme bitmişti; dosya klasörde duruyor, Premiere'e eklenmedi: /.test(yk.durum()), yk.durum());

  /* ---------- 7c2) DENEME: indirme bittikten sonra İptal tam dosyayı vermez (hak düşmeden sınırsız indirme olmasın) ---------- */
  var dd = kur({ kurulu: true, ayar: { ytOnay: 1, ytKalite: "2160" }, akis: VP9, donusumdeIptal: true });
  fs.mkdirSync(hedefKlasor(dd), { recursive: true });
  var ddBaska = path.join(hedefKlasor(dd), "Eski [" + ID + "] 720p.mp4");
  fs.writeFileSync(ddBaska, "eski-tam");
  dd.dom["yt-url"].value = URL1;
  await tikla(dd.dom, "yt-bilgi");
  await tikla(dd.dom, "yt-indir");
  await bekle(20);
  ok("deneme, dönüştürmede İptal: bu indirmenin 4K dosyası ve geçicisi silinir; önceki tam dosya kalır",
    !!dd.c.donusumGecici && js(fs.readdirSync(hedefKlasor(dd))) === js([path.basename(ddBaska)]), js(fs.readdirSync(hedefKlasor(dd))));
  ok("deneme, dönüştürmede İptal: hak düşmez, Premiere'e eklenmez, durum 'dosya da silindi', Klasörde göster gizli",
    dd.c.harca.length === 0 && !dd.c.call.some(function (x) { return x.fn === "KS_importDownloaded"; }) &&
    dd.durum() === "İptal edildi. Deneme hakkın düşmedi; indirilen dosya da silindi." && dd.dom["yt-sonuc"].hidden === true &&
    !dd.KY._durum().sonDosya && dd.dom["yt-indir"].hidden === false && dd.dom["yt-iptal"].hidden === true, dd.durum());

  var dy = kur({ kurulu: true, ayar: { ytOnay: 1 }, yoklamadaIptal: true });
  dy.dom["yt-url"].value = URL1;
  await tikla(dy.dom, "yt-bilgi");
  await tikla(dy.dom, "yt-indir");
  await bekle(20);
  ok("deneme, codec yoklamasında İptal: indirilen 1080p dosya silinir, hak düşmez, eklenmez",
    js(fs.readdirSync(hedefKlasor(dy))) === js([]) && dy.c.harca.length === 0 && !dy.c.call.some(function (x) { return x.fn === "KS_importDownloaded"; }) &&
    /Deneme hakkın düşmedi/.test(dy.durum()), js([fs.readdirSync(hedefKlasor(dy)), dy.durum()]));

  // önceden klasörde olan aynı dosya (yt-dlp "zaten indirildi"): deneme kipinde de dokunulmaz
  var dv = kur({ kurulu: true, ayar: { ytOnay: 1 }, yoklamadaIptal: true });
  fs.mkdirSync(hedefKlasor(dv), { recursive: true });
  var dvTam = path.join(hedefKlasor(dv), "Deneme ⧸ videosu： başlık？ [" + ID + "] 1080p.mp4");
  fs.writeFileSync(dvTam, "onceden");
  dv.dom["yt-url"].value = URL1;
  await tikla(dv.dom, "yt-bilgi");
  await tikla(dv.dom, "yt-indir");
  await bekle(20);
  ok("deneme, önceden var olan dosya: İptal'de silinmez, hak düşmez", fs.existsSync(dvTam) && dv.c.harca.length === 0 &&
    /^İptal edildi\. İndirme bitmişti; dosya klasörde duruyor/.test(dv.durum()), dv.durum());

  // silinemeyen (kilitli) dosya: dosya verilmiş sayılır, hak bir kez düşer
  var dk = kur({ kurulu: true, ayar: { ytOnay: 1 }, yoklamadaIptal: true, silinemez: /\] 1080p\.mp4$/ });
  dk.dom["yt-url"].value = URL1;
  await tikla(dk.dom, "yt-bilgi");
  await tikla(dk.dom, "yt-indir");
  var dkTam = path.join(hedefKlasor(dk), "Deneme ⧸ videosu： başlık？ [" + ID + "] 1080p.mp4");
  ok("deneme, dosya silinemezse: dosya klasörde kalır ve hak bir kez düşer (bildirilir), eklenmez",
    fs.existsSync(dkTam) && js(dk.c.harca) === js(["youtube"]) && dk.c.toast.some(function (t) { return /deneme hakkı kullanıldı/.test(t[0]); }) &&
    !dk.c.call.some(function (x) { return x.fn === "KS_importDownloaded"; }) && /dosya klasörde duruyor/.test(dk.durum()) && dk.dom["yt-sonuc"].hidden === false, dk.durum());

  /* ---------- 7c3) eski yt-dlp göreli yol yazarsa hedef klasöre göre çözülür ---------- */
  var gy = kur({ kurulu: true, ayar: { ytOnay: 1 }, goreliYol: true });
  gy.dom["yt-url"].value = URL1;
  await tikla(gy.dom, "yt-bilgi");
  await tikla(gy.dom, "yt-indir");
  var gyIce = gy.c.call.filter(function (x) { return x.fn === "KS_importDownloaded"; })[0];
  ok("göreli SUFLOF yolu: Premiere'e hedef klasördeki mutlak yol gider", !!gyIce &&
    gyIce.arg.path === path.join(hedefKlasor(gy), "Deneme ⧸ videosu： başlık？ [" + ID + "] 1080p.mp4") && js(gy.c.harca) === js(["youtube"]), js(gyIce));

  /* ---------- 7d) Premiere'e ekleme adımında İptal kapalı (KS_importDownloaded yarıda kesilemez) ---------- */
  var ie = kur({ kurulu: true, ayar: { ytOnay: 1 }, icedeIptalDene: true });
  ie.dom["yt-url"].value = URL1;
  await tikla(ie.dom, "yt-bilgi");
  await tikla(ie.dom, "yt-indir");
  ok("ekleme adımı: İptal görünür ama kapalı, basılsa da iş iptal olmaz; hak bir kez, sonuç 'eklendi'",
    !!ie.c.iceIptal && ie.c.iceIptal.hidden === false && ie.c.iceIptal.disabled === true && ie.c.iceSonrasiIptal === false &&
    js(ie.c.harca) === js(["youtube"]) && /İndirildi ve Premiere'e eklendi/.test(ie.durum()) && ie.dom["yt-iptal"].hidden === true, js([ie.c.iceIptal, ie.durum()]));
  ie.c.bilgiIptal = null;
  await tikla(ie.dom, "yt-bilgi");
  ok("sonraki iş İptal'i yeniden açar (ekleme adımından kalma kapalılık taşınmaz)", !!ie.c.bilgiIptal && ie.c.bilgiIptal.hidden === false && ie.c.bilgiIptal.disabled === false, js(ie.c.bilgiIptal));

  /* ---------- 8) hatalar ---------- */
  var h1 = kur({ kurulu: true, ayar: { ytOnay: 1 }, indirmeHata: "ERROR: [youtube] " + ID + ": Sign in to confirm your age. This video may be inappropriate for some users." });
  h1.dom["yt-url"].value = URL1;
  await tikla(h1.dom, "yt-bilgi");
  await tikla(h1.dom, "yt-indir");
  ok("yaş sınırı: dostça Türkçe hata, hak düşmez, yarım dosya silindi, Güncelle önerilmez", /yaş sınırlı/.test(h1.durum()) && h1.c.harca.length === 0 &&
    fs.readdirSync(hedefKlasor(h1)).length === 0 && h1.dom["yt-guncelle-kutu"].hidden === true, h1.durum());
  var h2 = kur({ kurulu: true, ayar: { ytOnay: 1 }, indirmeHata: "ERROR: [youtube] " + ID + ": Signature extraction failed: Some formats may be missing" });
  h2.dom["yt-url"].value = URL1;
  await tikla(h2.dom, "yt-bilgi");
  await tikla(h2.dom, "yt-indir");
  ok("imza hatası: eski sürüm mesajı ve Güncelle kutusu", /eski sürüm/.test(h2.durum()) && h2.dom["yt-guncelle-kutu"].hidden === false, h2.durum());
  var h3 = kur({ bilgiHata: "ERROR: [youtube] " + ID + ": Private video. Sign in if you've been granted access to this video" });
  h3.dom["yt-url"].value = URL1;
  await tikla(h3.dom, "yt-bilgi");
  ok("özel video: Bilgi al'da dostça hata, önizleme yok, İndir kapalı", /özel/.test(h3.durum()) && h3.dom["yt-onizleme"].hidden !== false && h3.dom["yt-indir"].disabled === true, h3.durum());
  var h4 = kur({ kurulu: true, ayar: { ytOnay: 1 } });
  h4.dom["yt-url"].value = URL1;
  await tikla(h4.dom, "yt-bilgi");
  var engel = path.join(h4.ev, "dosya-klasor-degil");
  fs.writeFileSync(engel, "x");
  h4.ayar.ytKlasor = path.join(engel, "alt");
  await tikla(h4.dom, "yt-indir");
  ok("klasör yazılamıyor: başka klasör seç mesajı, yt-dlp indirmesi başlamaz", /yazılamıyor/.test(h4.durum()) && h4.ytCalismalari().length === 2 && h4.c.harca.length === 0, h4.durum());
  // imza hatasından sonra Güncelle, sürüm aynıysa indirmez ("zaten güncel")
  var h2Indirme = h2.c.download.length;
  await tikla(h2.dom, "yt-guncelle");
  ok("eski sürüm hatası → Güncelle: GitHub'daki sürüm kurulu → indirme yok, 'zaten güncel'", h2.c.download.length === h2Indirme && /zaten güncel: 2026\.08\.19/.test(h2.durum()), h2.durum());
  // "yt-dlp çalıştırılamadı" (virüs koruması / izin): dosya doğrulanıyor ama açılmıyor → Güncelle GERÇEKTEN yeniden indirir
  var cz = kur({ ayar: {}, bilgiHata: "Error: spawn /Users/a/Library/Application Support/Suflo/yt-dlp/yt-dlp EACCES" });
  cz.dom["yt-url"].value = URL1;
  await tikla(cz.dom, "yt-bilgi");
  ok("çalıştırılamadı: mesaj ve 'yeniden indirip doğrular' Güncelle kutusu", /çalıştırılamadı/.test(cz.durum()) && cz.dom["yt-guncelle-kutu"].hidden === false &&
    /yeniden indirip doğrular/.test(cz.dom["yt-guncelle-metin"].textContent) && cz.c.download.length === 2, js([cz.durum(), cz.dom["yt-guncelle-metin"].textContent]));
  await tikla(cz.dom, "yt-guncelle");
  var czUrl = cz.c.download.slice(2).map(function (d) { return d.url; });
  ok("çalıştırılamadı → Güncelle: aynı sürüm yine SHA2-256SUMS ile indirilip doğrulanır, 'zaten güncel' denmez", czUrl.length === 2 && /SHA2-256SUMS$/.test(czUrl[0]) && /yt-dlp_macos$/.test(czUrl[1]) &&
    /yeniden indirildi ve doğrulandı: 2026\.08\.19/.test(cz.durum()) && cz.dom["yt-guncelle-kutu"].hidden === true && sha(fs.readFileSync(cz.exe)) === sha(IKILI), js([czUrl, cz.durum()]));
  await tikla(cz.dom, "yt-guncelle");
  ok("zorla yalnız o hata için: kutu kapandıktan sonraki Güncelle sürüm aynıysa indirmez", cz.c.download.length === 4 && /zaten güncel/.test(cz.durum()), cz.durum());

  /* ---------- 9) canlı yayın ---------- */
  var cy = kur({ kurulu: true, ayar: { ytOnay: 1 }, j: { canli: "is_live" } });
  cy.dom["yt-url"].value = URL1;
  await tikla(cy.dom, "yt-bilgi");
  ok("canlı yayın: İndir kapalı, açıklayıcı mesaj", cy.dom["yt-indir"].disabled === true && /canlı yayın/.test(cy.durum()), cy.durum());

  /* ---------- 10) özet tutmuyor: dosya silinir, hiç çalıştırılmaz ---------- */
  var sb = kur({ sumsBozuk: true });
  sb.dom["yt-url"].value = URL1;
  await tikla(sb.dom, "yt-bilgi");
  ok("SHA-256 tutmadı: dosya silindi, hiçbir yt-dlp çalıştırılmadı, kayıt yok", sb.ytCalismalari().length === 0 && !fs.existsSync(sb.exe) &&
    !fs.existsSync(path.join(sb.ytdir, "suflo-ytdlp.json")) && fs.readdirSync(sb.ytdir).length === 0 && /SHA-256 tutmadı/.test(sb.durum()), js([fs.readdirSync(sb.ytdir), sb.durum()]));

  /* ---------- 11) kurcalanmış ikili çalıştırılmaz, yeniden doğrulanmış indirilir ---------- */
  var kc = kur({ ayar: {} });
  kc.dom["yt-url"].value = URL1;
  await tikla(kc.dom, "yt-bilgi");
  fs.writeFileSync(kc.exe, "KOTU-IKILI");
  var kc2 = kur({ ayar: {}, ev: kc.ev });   // aynı kurulumda yeni oturum (doğrulama önbelleği boş)
  kc2.dom["yt-url"].value = URL1;
  await tikla(kc2.dom, "yt-bilgi");
  ok("yeni oturumda kurcalanmış ikili: çalıştırılmadan yeniden indirildi ve doğrulandı", kc2.c.download.length === 2 && kc2.c.calisanOzet.length === 2 &&
    kc2.c.calisanOzet.every(function (h) { return h === sha(IKILI); }) && sha(fs.readFileSync(kc.exe)) === sha(IKILI) && /Kaliteyi seç/.test(kc2.durum()), js([kc2.c.download.length, kc2.c.calisanOzet, kc2.durum()]));
  var kc3 = kur({ ayar: {}, ev: kc.ev });
  kc3.dom["yt-url"].value = URL1;
  await tikla(kc3.dom, "yt-bilgi");
  ok("sağlam kurulumda yeni oturum: indirme yok, yalnız -J (özet bir kez hesaplanır)", kc3.c.download.length === 0 && kc3.c.calisanOzet.length === 1, js(kc3.c.calisanOzet.length));

  /* ---------- 11b) yt-dlp'nin geçici klasörü: PyInstaller _MEI… artıkları Suflo'nun klasöründe, sonraki çalıştırmada silinir ---------- */
  var me = kur({ kurulu: true, ayar: { ytOnay: 1 } });
  me.dom["yt-url"].value = URL1;
  await tikla(me.dom, "yt-bilgi");
  await tikla(me.dom, "yt-indir");
  var meTmp = path.join(me.ytdir, "tmp");
  var meYt = me.ytCalismalari();
  ok("her yt-dlp çalıştırması (--version, -J, indirme) TMPDIR / TEMP / TMP = Suflo'nun yt-dlp/tmp klasörü", meYt.length === 3 && meYt.every(function (r) {
    return r.opts.env && r.opts.env.TMPDIR === meTmp && r.opts.env.TEMP === meTmp && r.opts.env.TMP === meTmp;
  }) && fs.statSync(meTmp).isDirectory(), js(meYt.map(function (r) { return r.opts.env; })));
  ok("ffmpeg ve sistem araçlarına geçici ortam verilmez", me.c.run.filter(function (r) { return r.cmd !== me.exe; }).every(function (r) { return !r.opts.env; }));
  fs.mkdirSync(path.join(meTmp, "_MEI48213"), { recursive: true });
  fs.writeFileSync(path.join(meTmp, "_MEI48213", "python312.dll"), "x");
  fs.mkdirSync(path.join(meTmp, "baska-klasor"), { recursive: true });
  fs.writeFileSync(path.join(meTmp, "notlar.txt"), "x");
  await tikla(me.dom, "yt-bilgi");
  ok("öldürülmüş yt-dlp'nin _MEI artığı bir sonraki çalıştırmadan önce silinir; başka dosyalara dokunulmaz",
    !fs.existsSync(path.join(meTmp, "_MEI48213")) && fs.existsSync(path.join(meTmp, "baska-klasor")) && fs.existsSync(path.join(meTmp, "notlar.txt")) &&
    js(me.c.rmrf) === js(["_MEI48213"]), js([fs.readdirSync(meTmp), me.c.rmrf]));

  /* ---------- 12) Güncelle ve Doctor ---------- */
  var g = kur({ ayar: {} });
  var bos = await g.KY.doctorSatirlari();
  ok("Doctor: kurulu değil → uyarı değil, ağ yok", bos.length === 1 && bos[0].status === "good" && /Kurulu değil/.test(bos[0].detail) && bos[0].group === "system" && g.c.http.length === 0, js(bos));
  g.dom["yt-url"].value = URL1;
  await tikla(g.dom, "yt-bilgi");
  var guncel = await g.KY.doctorSatirlari();
  ok("Doctor: kurulu ve güncel", guncel[0].status === "good" && /2026\.08\.19 · güncel/.test(guncel[0].detail), js(guncel));
  var r0 = await g.KY.guncelle(function () {});
  ok("Güncelle: GitHub'daki sürüm kurulu → indirmez, 'güncel'", r0.guncel === true && r0.surum === "2026.08.19" && g.c.download.length === 2);
  var gy = kur({ ayar: {}, apiEtiket: "2026.10.01", ev: g.ev });
  var yeni = await gy.KY.doctorSatirlari();
  ok("Doctor: yeni sürüm var → uyarı + update-ytdlp", yeni[0].status === "warn" && yeni[0].action === "update-ytdlp" && /2026\.08\.19 kurulu · 2026\.10\.01 hazır/.test(yeni[0].detail), js(yeni));
  var gy2 = kur({ ayar: {}, apiEtiket: "2026.10.01", yeniSurum: true, ev: g.ev });
  gy2.dom["yt-guncelle-kutu"].hidden = false;
  await tikla(gy2.dom, "yt-guncelle");
  var meta = JSON.parse(fs.readFileSync(path.join(g.ytdir, "suflo-ytdlp.json"), "utf8"));
  ok("Güncelle düğmesi: yeni sürüm doğrulanıp yerine kondu, kutu kapandı", meta.surum === "2026.10.01" && meta.sha256 === sha(YENI_IKILI) &&
    sha(fs.readFileSync(g.exe)) === sha(YENI_IKILI) && gy2.dom["yt-guncelle-kutu"].hidden === true && /güncellendi: 2026\.10\.01/.test(gy2.durum()) &&
    !fs.existsSync(g.exe + ".eski"), gy2.durum());
  fs.writeFileSync(g.exe, "KURCALANDI");
  var gk = kur({ ayar: {}, ev: g.ev });
  var bozuk = await gk.KY.doctorSatirlari();
  ok("Doctor: dosya değişmişse 'doğrulanamadı' + onarım", bozuk[0].status === "warn" && bozuk[0].action === "update-ytdlp" && bozuk[0].title === "yt-dlp doğrulanamadı", js(bozuk));

  /* ---------- 13) ilk çalıştırma başarısız: kurulum geri alınır ---------- */
  var sv = kur({ surumHata: true });
  sv.dom["yt-url"].value = URL1;
  await tikla(sv.dom, "yt-bilgi");
  ok("--version başarısız: ikili silinir, kayıt yazılmaz", !fs.existsSync(sv.exe) && !fs.existsSync(path.join(sv.ytdir, "suflo-ytdlp.json")) && /çalışmadı/.test(sv.durum()), sv.durum());

  /* ---------- 14) bağlantı değişince önizleme temizlenir; proje kaydedilmemiş ---------- */
  var u = kur({ kurulu: true, ayar: { ytOnay: 1 }, projeYok: true });
  u.dom["yt-url"].value = URL1;
  await tikla(u.dom, "yt-bilgi");
  ok("proje kaydedilmemiş: Videolar / Suflo İndirilenler + not", u.dom["yt-klasor-yol"].textContent === path.join(u.ev, "Movies", "Suflo İndirilenler") && u.dom["yt-klasor-not"].hidden === false,
    u.dom["yt-klasor-yol"].textContent);
  ok("macOS: not Filmler (Movies) der (Videolar değil); yol yön yalıtımlı iç düğümde (dar panelde sondaki klasör görünür)",
    u.dom["yt-klasor-not"].textContent === Y.klasorNotu("darwin") && /Filmler \(Movies\)/.test(u.dom["yt-klasor-not"].textContent) &&
    u.dom["yt-klasor-yol"].children.length === 1 && u.dom["yt-klasor-yol"].children[0].className === "yt-klasor-ic" &&
    u.dom["yt-klasor-yol"].getAttribute("title") === u.dom["yt-klasor-yol"].textContent, u.dom["yt-klasor-not"].textContent);
  var uw = kur({ platform: "win32", projeYok: true });
  uw.dinleyici.youtube();
  await bekle(10);
  ok("Windows: not Videolar der; açık proje yokken de görünür", uw.dom["yt-klasor-not"].hidden === false && uw.dom["yt-klasor-not"].textContent === Y.klasorNotu("win32") &&
    /Videolar klasörüne/.test(uw.dom["yt-klasor-not"].textContent), uw.dom["yt-klasor-not"].textContent);
  u.dom["yt-url"].value = "https://youtu.be/AAAAAAAAAAA";
  u.dom["yt-url"]._o.input();
  ok("başka bağlantı: önizleme ve çipler temizlenir, İndir kapalı", u.dom["yt-onizleme"].hidden === true && u.dom["yt-indir"].disabled === true && u.dom["yt-k-1080"].disabled === true);
  u.dom["yt-url"].value = URL1;
  await tikla(u.dom, "yt-indir");
  ok("bilgi alınmadan İndir: 'Önce Bilgi al'", /Önce Bilgi al/.test(u.durum()) && u.c.kapi.length === 0);

  /* ---------- 15) JS çalıştırıcısı uyarısı ve Deno ---------- */
  var d = kur({ kurulu: true, ayar: { ytOnay: 1 }, jsYok: true });
  fs.mkdirSync(path.join(d.ev, ".deno", "bin"), { recursive: true });
  fs.writeFileSync(path.join(d.ev, ".deno", "bin", "deno"), "");
  d.dom["yt-url"].value = URL1;
  await tikla(d.dom, "yt-bilgi");
  var jarg = d.ytCalismalari().filter(function (r) { return r.args.indexOf("-J") !== -1; })[0].args;
  ok("JS çalıştırıcısı yok uyarısı gösterilir; ~/.deno/bin/deno varsa --js-runtimes", d.dom["yt-js-not"].hidden === false && /Deno/.test(d.dom["yt-js-not"].textContent) &&
    deger(jarg, "--js-runtimes") === "deno:" + d.ev.replace(/\/+$/, "") + "/.deno/bin/deno", js(jarg));   // darwin yolu: "/" ile (Windows CI'da da)

  /* ---------- 16) kaynak denetimleri ---------- */
  var SRC = fs.readFileSync(path.join(KOK, "js", "youtube-indir-ui.js"), "utf8").replace(/\r\n/g, "\n");
  function govde(imza) { var i = SRC.indexOf(imza); var j = SRC.indexOf("\n  }\n", i); return i < 0 ? "" : SRC.slice(i, j); }
  ok("init: Premiere çağrısı ve süreç yok", !/K\.call\(|K\.run\(|K\.download\(|K\.httpGet\(/.test(govde("function init()")));
  ok("kabuk dizesi yok: exec / execSync / shell kullanılmaz", !/\bexec(Sync)?\(|shell:\s*true|child_process/.test(SRC));
  ok("chmod ve ilk çalıştırma SHA-256 doğrulamasından sonra", SRC.indexOf("Y.ozetDogrula(sums, varlik, sha") < SRC.indexOf("K.fs.chmodSync(hedef, 493)") &&
    SRC.indexOf("K.fs.chmodSync(hedef, 493)") < SRC.indexOf('K.run(hedef, ["--version"]') && SRC.indexOf("Y.ozetDogrula(sums, varlik, sha") < SRC.lastIndexOf("K.fs.renameSync(gecici, hedef)"));
  var HTML = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
  ok("index: betik sırası youtube-indir.js → youtube-indir-ui.js → library-health.js → app.js", HTML.indexOf('src="js/youtube-indir.js"') > HTML.indexOf('src="js/engine.js"') &&
    HTML.indexOf('src="js/youtube-indir.js"') < HTML.indexOf('src="js/youtube-indir-ui.js"') && HTML.indexOf('src="js/youtube-indir-ui.js"') < HTML.indexOf('src="js/library-health.js"') &&
    HTML.indexOf('src="js/youtube-indir-ui.js"') < HTML.indexOf('src="js/app.js"'));
  ok("index: tüm kimlikler var, yan menüde Podcast'ten sonra PRO kilitli", IDLER.every(function (id) { return HTML.indexOf('id="' + id + '"') !== -1; }) &&
    /data-tab="youtube">[\s\S]{0,400}<b>YouTube İndir <em class="ky-yeni">YENİ<\/em><\/b>[\s\S]{0,120}data-kilit>PRO/.test(HTML) && HTML.indexOf('data-tab="youtube"') > HTML.indexOf('data-tab="podcast"'));
  ok("index: onay metni spec ile aynı ve araç altında kısa hatırlatma", HTML.indexOf(Y.ONAY_METNI) !== -1 && /class="hint yt-hatirlatma">Yalnızca indirme hakkın olan içeriği indir/.test(HTML));
  ok("index: tanıtım düğmesi youtube özelliği", /data-pro-feature="youtube">YouTube indiriciyi aç — 749 TL</.test(HTML));
  var APP = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8");
  ok("app.js: başlatır, yan menüyü kilitler, tanıtımı Pro'da gizler", /KYoutube\.init\(\)/.test(APP) && /Pro\.markLocked\(document\.querySelector\('\.ky-oge\[data-tab="youtube"\]'\), !s\.pro\)/.test(APP) && /"yt-tanitim"/.test(APP));
  var DM = require(path.join(KOK, "js", "deneme.js"));
  ok("deneme.js: youtube 3 haklı, adı, tanıtım ipucu Bilgi al'ı gösterir", DM.listede("youtube") && DM.kalan(DM.bos(), "youtube") === 3 && DM.AD.youtube === "YouTube indirici" &&
    DM.tanitimIpucu("youtube").hedef === "yt-bilgi");
  ok("pro.js: özellik etiketi", /youtube:\s+'YouTube indirici: MP3 ve 720p \/ 1080p \/ 4K, projeye otomatik'/.test(fs.readFileSync(path.join(KOK, "js", "pro.js"), "utf8")));
  var VR = fs.readFileSync(path.join(KOK, "tools", "verify-release.ps1"), "utf8");
  var gerekli = (/\$required = @\(([\s\S]*?)\n\s*\)/.exec(VR) || ["", ""])[1];
  ok("paket: js/ klasörü ZXP ve kurucuda; verify-release iki dosyayı zorunlu tutar; yt-dlp ikilisi pakette yok",
    /\$stageItems = @\([^)]*"js"/.test(fs.readFileSync(path.join(KOK, "tools", "package.ps1"), "utf8")) && /\$panelItems = @\([^)]*"js"/.test(fs.readFileSync(path.join(KOK, "tools", "kurucu-yap.ps1"), "utf8")) &&
    /js\/youtube-indir\\\.js\$/.test(gerekli) && /js\/youtube-indir-ui\\\.js\$/.test(gerekli) && !fs.readdirSync(path.join(KOK, "js")).some(function (f) { return /^yt-dlp/i.test(f); }), gerekli.slice(0, 300));
  var NOT = fs.readFileSync(path.join(KOK, "THIRD_PARTY_NOTICES.md"), "utf8");
  ok("THIRD_PARTY_NOTICES: çalışırken indirilenlerde yt-dlp (Unlicense)", /## Runtime downloads \(not bundled\)[\s\S]*yt-dlp[\s\S]*Unlicense/.test(NOT));
  var LH = fs.readFileSync(path.join(KOK, "js", "library-health.js"), "utf8");
  ok("Doctor: yt-dlp satırı ve güvenli onarım", /ytdlpChecks\(\)/.test(LH) && /"update-ytdlp": "yt-dlp'yi güncelle"/.test(LH) && /KYoutube\.guncelle\(say\)/.test(LH));

  /* ---------- 17) İngilizce arayüz ---------- */
  var I18N = require(path.join(KOK, "js", "i18n.js"));
  I18N.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  function cevir(n) {
    if (!n) return "";
    if (typeof n === "string") return I18N.translate(n);
    if (n.nodeType === 3) return I18N.translate(n.textContent);
    if (n.getAttribute && n.getAttribute("data-i18n-skip") !== null) return n.textContent;
    return n.children && n.children.length ? n.children.map(cevir).join("") : I18N.translate(n.textContent);
  }
  var en = cevir(b.dom["yt-durum"]);
  ok("İngilizce: sonuç satırı çevrilir, dosya ve kutu adı aynen", /^Downloaded and added to Premiere: /.test(en) && en.indexOf(path.basename(dosya)) !== -1 && /Suflo İndirilenler bin\./.test(en), en);
  ok("İngilizce: dönüştürme notu ve hata metinleri", /This ffmpeg has no libx264; h264_nvenc was used/.test(cevir(w.dom["yt-durum"])) && /age-restricted/.test(cevir(h1.dom["yt-durum"])) &&
    /SHA-256 mismatch/.test(cevir(sb.dom["yt-durum"])), cevir(w.dom["yt-durum"]));
  ok("İngilizce: ilerleme ve kurulum satırları", I18N.translate("yt-dlp iniyor… %45 (≈ 36 MB)") === "Downloading yt-dlp… 45% (≈ 36 MB)" &&
    I18N.translate(Y.ilerlemeMetni({ asama: "indir", oran: 0.5, hiz: 4404019, eta: 3900 })) === "Downloading… · 50% · 4,2 MB/s · ~1 h 5 min left", I18N.translate(Y.ilerlemeMetni({ asama: "indir", oran: 0.5, hiz: 4404019, eta: 3900 })));
  ok("İngilizce: dönüştürmede / yoklamada İptal, zorla Güncelle ve klasör notları", /^Conversion canceled\. The downloaded file is still in the folder and wasn't added to Premiere: /.test(cevir(dc.dom["yt-durum"])) &&
    cevir(dc.dom["yt-durum"]).indexOf(path.basename(dcTam)) !== -1 && /^Canceled\. The download had already finished; the file is in the folder and wasn't added to Premiere: /.test(cevir(yk.dom["yt-durum"])) &&
    I18N.translate("yt-dlp yeniden indirildi ve doğrulandı: 2026.08.19") === "yt-dlp downloaded again and verified: 2026.08.19" &&
    I18N.translate("Güncelle yt-dlp'yi yeniden indirip doğrular.") === "Update downloads yt-dlp again and verifies it." &&
    /Movies folder/.test(I18N.translate(Y.klasorNotu("darwin"))) && /Videos folder/.test(I18N.translate(Y.klasorNotu("win32"))) &&
    I18N.translate("İndirmeyi durdurur; yarım dosyalar silinir, bitmiş indirme klasörde kalır") !== "İndirmeyi durdurur; yarım dosyalar silinir, bitmiş indirme klasörde kalır",
    js([cevir(dc.dom["yt-durum"]), cevir(yk.dom["yt-durum"])]));
  ok("İngilizce: deneme ipucu", I18N.translate(DM.tanitimIpucu("youtube").mesaj) === "Trial on: now press \"Get info\"", I18N.translate(DM.tanitimIpucu("youtube").mesaj));

  /* ---------- 18) köprü: süreç grubu ---------- */
  await kopruTesti();

  console.log("\n" + gecen + "/" + toplam + " gecti");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack)); process.exit(1); });

async function kopruTesti() {
  var SRC = fs.readFileSync(path.join(KOK, "js", "bridge.js"), "utf8");
  function yukle(platform, ek) {
    ek = ek || {};
    var cagri = { spawn: [], execFile: [], kill: [], grup: [] };
    var sahteCp = {
      spawn: function (cmd, args, o) {
        cagri.spawn.push({ cmd: cmd, o: o });
        var c = new EventEmitter();
        c.pid = 4242;
        c.stdout = new EventEmitter(); c.stdout.setEncoding = function () {};
        c.stderr = new EventEmitter(); c.stderr.setEncoding = function () {};
        c.kill = function (s) { cagri.kill.push(s); return true; };
        return c;
      },
      execFile: function (cmd, args, o, cb) { cagri.execFile.push({ cmd: cmd, args: args }); if (cb) setImmediate(function () { cb(null); }); return new EventEmitter(); },
      execSync: function () { return ""; }
    };
    var sb = {
      window: {}, console: console,
      require: function (ad) { return ad === "child_process" ? sahteCp : (ek.moduller && ek.moduller[ad]) || require(ad); },
      process: { platform: platform, env: ek.env || { PATH: "/usr/bin" }, versions: process.versions, arch: process.arch, kill: function (pid, sig) { cagri.grup.push([pid, sig]); } },
      URL: URL, Promise: Promise, Buffer: Buffer, JSON: JSON, Math: Math, Date: Date, setTimeout: setTimeout, clearTimeout: clearTimeout, setImmediate: setImmediate,
      String: String, Number: Number, Object: Object, Array: Array, Error: Error, RegExp: RegExp, isFinite: isFinite,
      navigator: { platform: platform === "darwin" ? "MacIntel" : "Win32", userAgent: "" },
      CSInterface: function () { return { getSystemPath: function () { return TMP; }, evalScript: function () {} }; }
    };
    sb.CSInterface.SystemPath = { USER_DATA: "u", EXTENSION: "e" };
    sb.global = sb;
    vm.createContext(sb);
    vm.runInContext(SRC, sb, { filename: "bridge.js" });
    return { K: sb.window.K, cagri: cagri };
  }
  var m = yukle("darwin");
  var j = m.K.iptalJetonu();
  var is = m.K.run("/x/yt-dlp", ["-J"], { iptal: j, surecGrubu: true, timeout: 60000 });
  ok("köprü macOS: surecGrubu → detached spawn", m.cagri.spawn[0].o.detached === true);
  j.iptal();
  var r = await is;
  ok("köprü macOS: iptal tüm grubu öldürür (process.kill(-pid, SIGKILL)), child.kill yok", r.iptal === true && js(m.cagri.grup) === js([[-4242, "SIGKILL"]]) && m.cagri.kill.length === 0, js(m.cagri));
  var m2 = yukle("darwin");
  var j2 = m2.K.iptalJetonu();
  var is2 = m2.K.run("/x/whisper-cli", [], { iptal: j2 });
  j2.iptal();
  await is2;
  ok("köprü macOS: surecGrubu yoksa eskisi gibi (detached yok, child.kill SIGKILL)", !m2.cagri.spawn[0].o.detached && m2.cagri.grup.length === 0 && js(m2.cagri.kill) === js(["SIGKILL"]));
  var w = yukle("win32");
  var jw = w.K.iptalJetonu();
  var isw = w.K.run("C:\\x\\yt-dlp.exe", ["-J"], { iptal: jw, surecGrubu: true });
  jw.iptal();
  await isw;
  ok("köprü Windows: detached yok, taskkill /T /F ağacı", !w.cagri.spawn[0].o.detached && w.cagri.execFile.length === 1 && w.cagri.execFile[0].cmd === "taskkill" &&
    js(w.cagri.execFile[0].args) === js(["/pid", "4242", "/T", "/F"]) && w.cagri.grup.length === 0);

  /* opts.env: yt-dlp'nin geçici klasörü; Windows'ta büyük/küçük harf duyarsız (eski "Temp" yazımı atılır) */
  var we = yukle("win32", { env: { Path: "C:\\Windows", Temp: "C:\\Users\\a\\AppData\\Local\\Temp", tmp: "C:\\x", USERPROFILE: "C:\\Users\\a" } });
  var jwe = we.K.iptalJetonu();
  var iswe = we.K.run("C:\\x\\yt-dlp.exe", ["-J"], { iptal: jwe, surecGrubu: true, env: { TMPDIR: "C:\\S\\tmp", TEMP: "C:\\S\\tmp", TMP: "C:\\S\\tmp" } });
  jwe.iptal(); await iswe;
  var wenv = we.cagri.spawn[0].o.env || {};
  ok("köprü Windows env: TEMP / TMP / TMPDIR Suflo klasörü, eski 'Temp' / 'tmp' yazımı yok, geri kalan ortam aynen", wenv.TEMP === "C:\\S\\tmp" && wenv.TMP === "C:\\S\\tmp" &&
    wenv.TMPDIR === "C:\\S\\tmp" && !("Temp" in wenv) && !("tmp" in wenv) && wenv.Path === "C:\\Windows" && wenv.USERPROFILE === "C:\\Users\\a", js(wenv));
  var wn = yukle("win32", { env: { Path: "C:\\Windows" } });
  var jwn = wn.K.iptalJetonu();
  var iswn = wn.K.run("C:\\x\\whisper-cli.exe", [], { iptal: jwn });
  jwn.iptal(); await iswn;
  ok("köprü Windows: env verilmezse süreç ortamı eskisi gibi (env seçeneği yok)", wn.cagri.spawn[0].o.env === undefined);
  var me2 = yukle("darwin", { env: { PATH: "/usr/bin", HOME: "/Users/a", TMPDIR: "/var/folders/x/T/" } });
  var jme = me2.K.iptalJetonu();
  var isme = me2.K.run("/x/yt-dlp", ["-J"], { iptal: jme, surecGrubu: true, env: { TMPDIR: "/S/tmp", TEMP: "/S/tmp", TMP: "/S/tmp" } });
  jme.iptal(); await isme;
  var menv = me2.cagri.spawn[0].o.env || {};
  ok("köprü macOS env: Homebrew PATH korunur, TMPDIR Suflo klasörü", menv.TMPDIR === "/S/tmp" && /^\/opt\/homebrew\/bin:/.test(menv.PATH) && menv.HOME === "/Users/a", js(menv));

  /* httpGet vekil sunucuya uyar (sürüm denetimi: GitHub API); önce doğrudan gidiyordu */
  function sahteAg() {
    var kayit = { connect: [], get: [] };
    var soket = { sahte: "soket", destroy: function () { kayit.soketKapandi = true; } };
    function cevap(cb) {
      var res = new EventEmitter();
      res.statusCode = 200; res.headers = {}; res.setEncoding = function () {};
      setImmediate(function () { cb(res); res.emit("data", "{\"tag_name\":\"2026.10.01\"}"); res.emit("end"); });
    }
    function istek() { var q = new EventEmitter(); q.setTimeout = function () {}; q.destroy = function () {}; q.end = function () {}; return q; }
    var http = {
      request: function (o) {
        kayit.connect.push(o);
        var q = istek();
        q.end = function () { setImmediate(function () { q.emit("connect", { statusCode: kayit.ret ? 407 : 200 }, soket); }); };
        return q;
      },
      get: function (o, cb) { kayit.get.push({ http: true, o: o }); cevap(cb); return istek(); }
    };
    var https = { get: function (o, cb) { kayit.get.push({ https: true, o: o }); cevap(cb); return istek(); } };
    return { kayit: kayit, soket: soket, moduller: { http: http, https: https } };
  }
  var API = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
  var ag1 = sahteAg();
  var v1 = yukle("darwin", { moduller: ag1.moduller, env: { PATH: "/usr/bin", HTTPS_PROXY: "http://ali:gizli%40parola@vekil.sirket.local:3128" } });
  var r1 = await v1.K.httpGet(API, { "Accept": "application/vnd.github+json" });
  var c1 = ag1.kayit.connect[0] || {}, g1 = (ag1.kayit.get[0] || {}).o || {};
  ok("httpGet + HTTPS_PROXY: CONNECT tüneli (vekil, port, hedef:443, Proxy-Authorization), TLS aynı soket üzerinden",
    c1.method === "CONNECT" && c1.host === "vekil.sirket.local" && c1.port === 3128 && c1.path === "api.github.com:443" &&
    c1.headers["Proxy-Authorization"] === "Basic " + Buffer.from("ali:gizli@parola").toString("base64") &&
    ag1.kayit.get.length === 1 && ag1.kayit.get[0].https && g1.socket === ag1.soket && g1.servername === "api.github.com" && g1.host === "api.github.com" &&
    g1.path === "/repos/yt-dlp/yt-dlp/releases/latest" && g1.headers.Accept === "application/vnd.github+json" && r1.status === 200 && /2026\.10\.01/.test(r1.body), js([c1, g1.path, r1]));
  var ag2 = sahteAg();
  var v2 = yukle("darwin", { moduller: ag2.moduller, env: { PATH: "/usr/bin", HTTPS_PROXY: "http://vekil.sirket.local:3128", NO_PROXY: ".github.com" } });
  var r2 = await v2.K.httpGet(API, {});
  ok("httpGet + NO_PROXY: doğrudan (tünel yok)", ag2.kayit.connect.length === 0 && ag2.kayit.get.length === 1 && ag2.kayit.get[0].o.hostname === "api.github.com" && !ag2.kayit.get[0].o.socket && r2.status === 200);
  var ag3 = sahteAg();
  var v3 = yukle("darwin", { moduller: ag3.moduller, env: { PATH: "/usr/bin" } });
  var r3 = await v3.K.httpGet(API, {});
  ok("httpGet vekilsiz: eskisi gibi doğrudan", ag3.kayit.connect.length === 0 && ag3.kayit.get.length === 1 && ag3.kayit.get[0].o.hostname === "api.github.com" && ag3.kayit.get[0].o.port === 443 && r3.status === 200);
  var ag4 = sahteAg();
  ag4.kayit.ret = true;
  var v4 = yukle("darwin", { moduller: ag4.moduller, env: { PATH: "/usr/bin", HTTPS_PROXY: "vekil.sirket.local:8080" } });
  var r4 = await v4.K.httpGet(API, {});
  ok("httpGet: vekil tüneli reddederse (407) istek gitmez, status 0 ve neden", ag4.kayit.connect.length === 1 && ag4.kayit.connect[0].port === 8080 && ag4.kayit.get.length === 0 &&
    r4.status === 0 && /407/.test(r4.body), js(r4));
}
