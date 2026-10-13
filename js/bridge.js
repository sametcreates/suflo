/*
 * Kesit — köprü katmanı
 * CEP/Node yeteneklerini tek yerde toplar: ExtendScript çağrıları, dosya sistemi,
 * ffmpeg çalıştırma, ayar saklama. CEP dışında (tarayıcı önizlemesi) güvenle çöker.
 */
window.K = (function () {
  "use strict";

  var cs = new CSInterface();
  var nodeOK = false;
  var fs = null, path = null, os = null, cp = null;

  try {
    if (typeof require === "function") {
      fs = require("fs");
      path = require("path");
      os = require("os");
      cp = require("child_process");
      nodeOK = true;
    }
  } catch (e) { nodeOK = false; }

  /* ---------------- Platform ---------------- */

  // Windows ve macOS'ta yol, arşiv açma ve araç konumları farklı; tek yerden sorulur.
  var MAC = false, WIN = true;
  try {
    if (nodeOK) { MAC = process.platform === "darwin"; WIN = process.platform === "win32"; }
    else { MAC = /Mac|Darwin/i.test(navigator.platform + " " + navigator.userAgent); WIN = !MAC; }
  } catch (eP) {}

  // Apple Silicon'da whisper.cpp Metal ile derlenir: GPU hızlandırma kendiliğinden açık.
  // Premiere "Rosetta kullanarak aç" ile açıldıysa os.arch() x64 der; çeviri altında olmak da Apple Silicon demektir.
  function macMetal() {
    try { return MAC && nodeOK && (os.arch() === "arm64" || rosettaAltinda()); } catch (e) { return false; }
  }

  // Süreç Rosetta 2 ile mi çevriliyor (sysctl.proc_translated = 1)? Intel Mac'te anahtar yok: false
  var _rosetta = null;
  function rosettaAltinda() {
    if (_rosetta !== null) return _rosetta;
    _rosetta = false;
    try {
      if (MAC && nodeOK && cp && typeof cp.execFileSync === "function") {
        _rosetta = String(cp.execFileSync("/usr/sbin/sysctl", ["-n", "sysctl.proc_translated"], { encoding: "utf8", timeout: 5000 })).trim() === "1";
      }
    } catch (e) { _rosetta = false; }
    return _rosetta;
  }

  // Paketle gelen Suflo Originals gibi salt-okunur iceriklerin kok yolu.
  // Ayar/veri klasorunden farklidir: ZXP nereye kurulursa orayi izler.
  function extensionPath() {
    try { return cs.getSystemPath(CSInterface.SystemPath.EXTENSION) || ""; }
    catch (e) { return ""; }
  }

  /* ---------------- ExtendScript ---------------- */

  /*
   * ExtendScript cagrisi. Premiere mesgul/modal haldeyken evalScript geri cagrisini HIC
   * cagirmayabiliyor; o zaman bu promise sonsuza dek askida kalir ve onu bekleyen dongu
   * (ornegin baglam yoklamasi) kalici olarak kilitlenir — panel secili klibi gormemeye baslar.
   * Bu yuzden her cagri en gec timeout sonunda MUTLAKA sonuclanir.
   */
  /*
   * ExtendScript tek is parcacikli: uzun bir host islemi (ses disa aktarimi,
   * yuzlerce MOGRT) surerken gonderilen her cagri kuyruga girer. Zaman asimi
   * promise'i cozer ama evalScript cevabi hala yoldadir. Yanitini henuz
   * almadigimiz cagrilari sayariz; baglam yoklamasi bekleyen varken yenisini
   * gondermez (bir saatlik islemde 120 yoklamanin birikmesi engellenir).
   */
  // id -> { bas: gonderim ani, sinir: bu sureden sonra "kayip cevap" sayilir }
  var yoldakiler = {};
  var cagriNo = 0;
  function hostMesgul() {
    var simdi = Date.now(), mesgul = false;
    Object.keys(yoldakiler).forEach(function (id) {
      var c = yoldakiler[id];
      // Cevabi hic gelmeyen (kaybolan) cagri yoklamayi sonsuza kilitlemesin:
      // zaman asiminin iki kati gecince yoldan dusulur
      if (simdi - c.bas > c.sinir) delete yoldakiler[id];
      else mesgul = true;
    });
    return mesgul;
  }

  function call(fn, arg, timeout) {
    return new Promise(function (resolve) {
      var bitti = false;
      var id = ++cagriNo;
      yoldakiler[id] = { bas: Date.now(), sinir: Math.min(2 * (timeout || 60000), 2 * 3600000) };
      function cevapGeldi() { delete yoldakiler[id]; }
      function son(v) {
        if (bitti) return;          // evalScript bazen gecikip sonra da cevap verebiliyor
        bitti = true;
        clearTimeout(saat);
        resolve(v);
      }
      var saat = setTimeout(function () {
        log("jsx ZAMAN ASIMI " + fn + " (" + (timeout || 60000) + " ms)");
        son({ ok: false, error: "Premiere yanıt vermedi (" + fn + ") — işlem zaman aşımına uğradı." });
      }, timeout || 60000);

      var script = arg === undefined
        ? fn + "()"
        : fn + '("' + encodeURIComponent(JSON.stringify(arg)) + '")';
      try {
        cs.evalScript(script, function (res) {
          cevapGeldi();
          if (res === "EvalScript error.") {
            log("jsx HATA " + fn + ": EvalScript error");
            son({ ok: false, error: "ExtendScript hatası (" + fn + ")" });
            return;
          }
          try {
            var parsed = JSON.parse(res);
            if (parsed && parsed.ok === false) log("jsx " + fn + ": " + parsed.error);
            son(parsed);
          }
          catch (e) {
            log("jsx " + fn + ": yanit okunamadi");
            son({ ok: false, error: "Yanıt okunamadı: " + String(res).slice(0, 200) });
          }
        });
      } catch (eE) {
        cevapGeldi();
        log("jsx " + fn + ": evalScript cagrilamadi - " + eE.message);
        son({ ok: false, error: "ExtendScript çağrılamadı (" + fn + ")" });
      }
    });
  }

  /* ---------------- Ayarlar ---------------- */

  function settingsPath() {
    if (!nodeOK) return null;
    var base;
    try { base = cs.getSystemPath(CSInterface.SystemPath.USER_DATA); } catch (e) { base = ""; }
    if (!base) base = os.homedir();
    var dir = path.join(base, "Kesit");
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (e2) {}
    return path.join(dir, "settings.json");
  }

  var _settings = null;
  var DEFAULT_EMOJI_CATALOG_URL = "https://assets.suflo.app/emoji/v1/catalog.json";
  /*
   * settings.json bu yuklemeden ONCE var miydi? Yoksa taze kurulum: ilk acilis
   * rehberi ("Ilk altyazin 2 dakikada") tam kartla acilir. Ilk saveSettings dosyayi
   * olusturdugu icin bu bilgi yalniz ilk okumada guvenilir; burada bir kez saklanir.
   */
  var _ayarDosyasiVardi = false;
  /*
   * settings.json vardi ama okunamadi/cozulemedi (yarim yazim, elle duzenleme, antivirus
   * kilidi): bu oturumdaki ilk kayit onu varsayilanlarla EZMESIN. 3.1'de rehber ve davet
   * acilista kaydettigi icin dosya kullanici hicbir sey yapmadan kaybolurdu. Ilk kayittan
   * once dosya settings.bozuk-<zaman>.json olarak saklanir; saklanamazsa yazilmaz.
   */
  var _okunamayanAyar = "";

  function loadSettings() {
    if (_settings) return _settings;
    _settings = {
      folders: [], provider: "local", endpoint: "", apiKey: "", ffmpeg: "", favs: [], recent: [],
      emojiAssetsCatalogUrl: DEFAULT_EMOJI_CATALOG_URL
    };
    try {
      var p = settingsPath();
      _ayarDosyasiVardi = !!(p && fs.existsSync(p));
      if (p && fs.existsSync(p)) {
        _okunamayanAyar = p;
        // Not Defteri UTF-8'i BOM ile kaydedebilir: JSON.parse BOM'da hata verir
        var disk = JSON.parse(String(fs.readFileSync(p, "utf8")).replace(/^\uFEFF/, ""));
        if (!disk || typeof disk !== "object" || Array.isArray(disk)) throw new Error("settings.json nesne degil");
        _okunamayanAyar = "";
        for (var k in disk) if (disk.hasOwnProperty(k)) _settings[k] = disk[k];

        // 2.6.1/2.6.2'de bos kaydedilmis eski deger, yeni Suflo Cloud
        // varsayilanini eziyordu. Yerel klasor kullanilmiyorsa bu eski durumu
        // bir kez onar; kullanicinin sonradan bilerek kapattigi CDN'e dokunma.
        if (!String(_settings.emojiAssetsKlasor || "").trim() &&
            !String(_settings.emojiAssetsCatalogUrl || "").trim() &&
            _settings.emojiAssetsCatalogDisabled !== true) {
          _settings.emojiAssetsCatalogUrl = DEFAULT_EMOJI_CATALOG_URL;
          _settings.emojiAssetsCatalogMigrated = "2.6.3";
          saveSettings();
        }
      }
    } catch (e) {}
    return _settings;
  }

  function saveSettings() {
    try {
      var p = settingsPath();
      var ayar = loadSettings();
      if (p && _okunamayanAyar === p) {
        if (fs.existsSync(p)) {
          var yedek = path.join(path.dirname(p), "settings.bozuk-" + Date.now() + ".json");
          try { fs.copyFileSync(p, yedek); }
          catch (eY) { try { log("ayarlar: okunamayan settings.json yedeklenemedi, uzerine yazilmadi"); } catch (eL) {} return false; }
          try { log("ayarlar: okunamayan settings.json yedeklendi: " + path.basename(yedek)); } catch (eL2) {}
        }
        _okunamayanAyar = "";
      }
      if (p) fs.writeFileSync(p, JSON.stringify(ayar, null, 2), "utf8");
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- Süreç çalıştırma ---------------- */

  // Süren alt süreç sayısı (Whisper, ffmpeg…): arayüz dili iş sürerken değiştirilmez
  var aktifSurec = 0;
  function surecSayisi() { return aktifSurec; }

  /*
   * İptal jetonu: uzun işler (transkripsiyon, ffmpeg, indirme) aynı jetonu paylaşır.
   *   iptalEdildi  true olduktan sonra geri dönmez
   *   iptal()      dinleyicileri bir kez çağırır (ikinci çağrı etkisiz)
   *   dinle(fn)    fn'i kaydeder, kaydı silen işlevi döner; jeton zaten iptalse fn hemen çağrılır
   * CEF 74 / Node 12'de yerleşik iptal denetleyicisi yok (Node 15): kendi küçük jetonumuz.
   */
  function iptalJetonu() {
    var dinleyiciler = [];
    var j = {
      iptalEdildi: false,
      iptal: function () {
        if (j.iptalEdildi) return;
        j.iptalEdildi = true;
        var liste = dinleyiciler.slice();
        dinleyiciler.length = 0;
        for (var i = 0; i < liste.length; i++) {
          try { liste[i](); } catch (e) { log("iptal dinleyicisi: " + (e && e.message ? e.message : e)); }
        }
      },
      dinle: function (fn) {
        if (typeof fn !== "function") return function () {};
        if (j.iptalEdildi) { try { fn(); } catch (e0) {} return function () {}; }
        dinleyiciler.push(fn);
        return function () {
          var k = dinleyiciler.indexOf(fn);
          if (k !== -1) dinleyiciler.splice(k, 1);
        };
      }
    };
    return j;
  }

  /*
   * Çift tıklama koruması: iş başlayınca "İptal" başlatma düğmesinin YERİNE geçiyor
   * (Altyazı oluştur, Sessizlikleri bul, İndir & kur). Çift tıklamanın ikinci tıkı aynı
   * noktada "İptal"e düşüp yeni başlayan işi iptal etmesin: düğme göründükten sonraki
   * IPTAL_ACILIS_MS içindeki tık ve çoklu tıkın (event.detail > 1) devamı yok sayılır.
   *   ev      click olayı (klavyeyle basışta detail 0: geçerli)
   *   acilis  düğmenin göründüğü an (Date.now()); 0/boş ise süre denetimi yok
   */
  var IPTAL_ACILIS_MS = 500;
  function iptalTikiGecerli(ev, acilis, simdi) {
    if (ev && typeof ev.detail === "number" && ev.detail > 1) return false;
    var t = typeof simdi === "number" ? simdi : Date.now();
    return !(acilis > 0 && t >= acilis && t - acilis < IPTAL_ACILIS_MS);
  }

  /*
   * Ters yön: iş bitince (İptal ya da kendiliğinden) başlatma düğmesi "İptal"in yerinde yeniden
   * belirir. İptal'e çift tıklamanın ikinci tıkı aynı noktada "Altyazı oluştur" / "Sessizlikleri
   * bul" / "İndir & kur"a düşüp yeni iş başlatmasın (yeni iş ses dışa aktarımında İptal'i kilitler).
   * Yalnız tık olayına uygulanır: programla çağrı (rehberin örnek klibi, Pro denemesinden sonra
   * "yeniden") olay taşımaz, her zaman geçerli.
   *   acilis  başlatma düğmesinin yeniden göründüğü an (Date.now()); 0 ise süre denetimi yok
   */
  function baslatTikiGecerli(ev, acilis, simdi) {
    if (!ev || typeof ev.detail !== "number") return true;
    return iptalTikiGecerli(ev, acilis, simdi);
  }

  // Kullanıcı iptal etti: hata değil (çağıran "İptal edildi" uyarısı gösterir, hata rehberine gitmez)
  function iptalHatasi(mesaj) {
    var e = new Error(mesaj || "İptal edildi");
    e.iptal = true;
    return e;
  }

  /*
   * Süreci ALT SÜREÇLERİYLE birlikte öldür. Windows'ta child.kill() yalnız ilk süreci kapatır;
   * whisper-cli / ffmpeg'in açtığı alt süreçler (ve kilitlediği WAV) yaşamaya devam eder:
   * taskkill /T (ağaç) /F (zorla). macOS'ta SIGKILL: whisper SIGTERM'de JSON yazmaya çalışmasın.
   */
  /*
   * grup (3.3, YouTube indirici): süreç kendi süreç grubunda açıldı (opts.surecGrubu, macOS/Linux'ta
   * detached). Eksi pid TÜM grubu öldürür: yt-dlp_macos (PyInstaller) açılışta kendi Python sürecini
   * ve indirirken ffmpeg'i açar; yalnız ana süreç ölürse onlar indirmeye devam ederdi.
   */
  function surecAgaciniOldur(child, grup) {
    if (!child) return;
    if (WIN && child.pid) {
      try {
        cp.execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, function (e) {
          // taskkill yoksa ya da başarısızsa en azından ana süreç kapansın (süreç zaten bittiyse zararsız)
          if (e) { try { child.kill(); } catch (e2) {} }
        });
        return;
      } catch (e3) {}
    }
    if (grup && child.pid && typeof process !== "undefined" && typeof process.kill === "function") {
      try { process.kill(-child.pid, "SIGKILL"); return; } catch (eG) {}
    }
    try { child.kill("SIGKILL"); } catch (e4) { try { child.kill(); } catch (e5) {} }
  }

  /*
   * opts.timeout   ms (varsayılan 5 dk)
   * opts.cwd       çalışma klasörü
   * opts.onStderr  fn(parça) — stderr akarken (ilerleme yüzdesi)
   * opts.onStdout  fn(parça) — stdout akarken (whisper-cli segment satırları); tam çıktı yine birikir
   * opts.iptal     K.iptalJetonu(): iptalde süreç ağacı öldürülür, { code: -2, iptal: true } döner
   * opts.surecGrubu (3.3) macOS/Linux'ta süreç kendi grubunda açılır (detached); iptal ve zaman
   *                aşımı bütün grubu öldürür (yt-dlp'nin açtığı alt süreçler dahil). Windows'ta
   *                taskkill /T zaten ağacı kapsar.
   * opts.env       (3.3) süreç ortamına eklenen / değiştirilen değişkenler (ör. yt-dlp'nin geçici
   *                klasörü TMPDIR / TEMP / TMP); geri kalan ortam aynen geçer. Windows'ta ad büyük /
   *                küçük harf duyarsız: aynı adın eski yazımı atılır, iki "Temp" kalmaz.
   */
  function run(cmd, args, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!nodeOK) { resolve({ code: -1, stdout: "", stderr: "Node erişimi yok" }); return; }
      var jeton = opts.iptal && typeof opts.iptal.dinle === "function" ? opts.iptal : null;
      // başlamadan iptal edilmiş iş: süreç hiç açılmaz
      if (jeton && jeton.iptalEdildi) { resolve({ code: -2, iptal: true, stdout: "", stderr: "" }); return; }
      var child;
      try {
        var spawnOpts = { windowsHide: true };
        /*
         * cwd: ffmpeg'in altyazı filtrelerinde (ass=/subtitles=) MUTLAK yol
         * kullanılamıyor. Filtre sözdiziminde ":" parametre ayracı olduğu için
         * "C:/..." ikinci parametre sanılıyor ve "Invalid argument" veriyor;
         * ters bölü ile kaçırmak da çözmüyor. Tek güvenilir yol, ffmpeg'i
         * dosyanın klasöründe çalıştırıp filtreye yalnız dosya adını vermek.
         */
        if (opts.cwd) spawnOpts.cwd = opts.cwd;
        if (opts.surecGrubu && !WIN) spawnOpts.detached = true;
        if (MAC || opts.env) {
          var env = {};
          for (var ek in process.env) if (process.env.hasOwnProperty(ek)) env[ek] = process.env[ek];
          // CEP surecinin PATH'i cogu zaman /usr/bin ile sinirli; Homebrew'i goremiyor
          if (MAC) {
            env.PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" +
              (process.env.PATH ? ":" + process.env.PATH : "");
          }
          if (opts.env) {
            for (var ad in opts.env) {
              if (!opts.env.hasOwnProperty(ad) || opts.env[ad] === undefined || opts.env[ad] === null) continue;
              if (WIN) {
                for (var eski in env) {
                  if (env.hasOwnProperty(eski) && eski !== ad && eski.toUpperCase() === ad.toUpperCase()) delete env[eski];
                }
              }
              env[ad] = String(opts.env[ad]);
            }
          }
          spawnOpts.env = env;
        }
        child = cp.spawn(cmd, args, spawnOpts);
      } catch (e) {
        resolve({ code: -1, stdout: "", stderr: String(e) });
        return;
      }
      var out = "", err = "", done = false, birak = null;
      aktifSurec++;
      function kapat() {
        done = true;
        aktifSurec = Math.max(0, aktifSurec - 1);
        clearTimeout(timer);
        if (birak) { birak(); birak = null; }
      }
      var timer = setTimeout(function () {
        if (done) return;
        if (opts.surecGrubu) surecAgaciniOldur(child, true);
        else { try { child.kill(); } catch (e) {} }
        kapat();
        resolve({ code: -1, stdout: out, stderr: err + "\n[zaman aşımı]" });
      }, opts.timeout || 300000);

      function finish(code) {
        if (done) return;
        kapat();
        if (code !== 0) {
          log("run HATA [" + String(cmd).replace(/^.*[\\\/]/, "") + "] kod=" + code + " " +
            String(err).split("\n").slice(-2).join(" ").slice(0, 200));
        }
        resolve({ code: code, stdout: out, stderr: err });
      }
      if (jeton) {
        birak = jeton.dinle(function () {
          if (done) return;
          kapat();
          surecAgaciniOldur(child, !!opts.surecGrubu);
          log("run IPTAL [" + String(cmd).replace(/^.*[\\\/]/, "") + "] kullanici iptal etti");
          resolve({ code: -2, iptal: true, stdout: out, stderr: err });
        });
      }
      // setEncoding: cok baytli harfler parca sinirinda bolunup U+FFFD olmasin
      if (child.stdout && child.stdout.setEncoding) child.stdout.setEncoding("utf8");
      if (child.stderr && child.stderr.setEncoding) child.stderr.setEncoding("utf8");
      child.stdout.on("data", function (d) {
        var s = String(d);
        out += s;
        if (opts.onStdout && !done) {
          try { opts.onStdout(s); } catch (eO) { log("onStdout: " + (eO && eO.message ? eO.message : eO)); }
        }
      });
      child.stderr.on("data", function (d) {
        var s = String(d);
        err += s;
        if (opts.onStderr && !done) opts.onStderr(s);
      });
      child.on("error", function (e) { err += String(e); finish(-1); });
      child.on("close", finish);
    });
  }

  /* ---------------- HTTP (Node üzerinden, CORS'suz) ---------------- */

  /*
   * CEP panelinin CEF tarafından yapılan fetch çağrıları file:// origin +
   * Authorization header yüzünden CORS preflight'a takılabilir (OpenAI izin
   * vermez). Node'un https modülü tarayıcı kısıtlarına tabi değildir; API
   * yüklemeleri bu yoldan yapılır.
   */
  // secenek.iptal: K.iptalJetonu() — iptalde istek kesilir, { status: 0, iptal: true } döner
  function httpUpload(urlStr, headers, fields, fileBuf, filename, mime, secenek) {
    return new Promise(function (resolve0) {
      if (!nodeOK) { resolve0({ status: 0, body: "Node erişimi yok" }); return; }
      var jeton = secenek && secenek.iptal && typeof secenek.iptal.dinle === "function" ? secenek.iptal : null;
      if (jeton && jeton.iptalEdildi) { resolve0({ status: 0, iptal: true, body: "İptal edildi" }); return; }
      var birak = null, bitti = false;
      function resolve(x) {
        if (bitti) return;
        bitti = true;
        if (birak) { birak(); birak = null; }
        resolve0(x);
      }
      var proto, Buf, u;
      try {
        u = new URL(urlStr);
        proto = require(u.protocol === "http:" ? "http" : "https");
        Buf = require("buffer").Buffer;
      } catch (e) {
        resolve({ status: 0, body: String(e) });
        return;
      }
      var boundary = "----kesit" + Date.now().toString(36);
      var parts = [];
      function addField(name, val) {
        parts.push(Buf.from(
          "--" + boundary + "\r\n" +
          'Content-Disposition: form-data; name="' + name + '"\r\n\r\n' +
          val + "\r\n"
        ));
      }
      for (var k in fields) {
        if (!fields.hasOwnProperty(k)) continue;
        // dizi degerler ayni adla coklu part olur (timestamp_granularities[] gibi)
        if (fields[k] instanceof Array) {
          for (var ai = 0; ai < fields[k].length; ai++) addField(k, fields[k][ai]);
        } else {
          addField(k, fields[k]);
        }
      }
      parts.push(Buf.from(
        "--" + boundary + "\r\n" +
        'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n' +
        "Content-Type: " + (mime || "application/octet-stream") + "\r\n\r\n"
      ));
      parts.push(Buf.from(fileBuf));
      parts.push(Buf.from("\r\n--" + boundary + "--\r\n"));
      var body = Buf.concat(parts);

      var hdrs = { "Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": body.length };
      for (var h in headers) if (headers.hasOwnProperty(h)) hdrs[h] = headers[h];

      var req = null;
      if (jeton) {
        birak = jeton.dinle(function () {
          resolve({ status: 0, iptal: true, body: "İptal edildi" });
          try { if (req) req.destroy(); } catch (eD) {}
        });
      }
      // vekil sunucuya uyar (Ayarlar › vekil): bulut transkripsiyonu da httpGet / download gibi vekilden geçer
      vekilliIstek(urlStr, { method: "POST", headers: hdrs }, function (res) {
        var data = "";
        res.setEncoding("utf8");   // cok baytli harfler (ş, ğ) parca sinirinda bolunmesin
        res.on("data", function (d) { data += d; });
        res.on("end", function () { resolve({ status: res.statusCode, body: data }); });
        res.on("error", function (eRs) { resolve({ status: 0, body: String(eRs) }); });
      }, function (e2, r) {
        if (e2) { resolve({ status: 0, body: String(e2 && e2.message ? e2.message : e2) }); return; }
        req = r;
        if (bitti) { try { req.destroy(); } catch (eB) {} return; }   // tünel kurulurken iptal edildi
        req.on("error", function (e3) { resolve({ status: 0, body: String(e3) }); });
        req.setTimeout(300000, function () { req.destroy(); resolve({ status: 0, body: "zaman aşımı" }); });
        req.write(body);
        req.end();
      });
    });
  }

  /* ---------------- Taslak kalıcılığı ---------------- */

  function draftPath() {
    if (!nodeOK) return null;
    var p = settingsPath();
    if (!p) return null;
    return path.join(path.dirname(p), "draft.json");
  }

  // Transkripti diske yaz — panel kapanırsa iş kaybolmasın.
  // Geçici dosyaya yazıp üzerine taşı: yazma ortasında çökme eski taslağı bozmasın.
  function saveDraft(obj) {
    try {
      var p = draftPath();
      if (!p) return false;
      var tmp = p + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(obj), "utf8");
      fs.renameSync(tmp, p);
      return true;
    } catch (e) { return false; }
  }

  function loadDraft() {
    try {
      var p = draftPath();
      if (!p || !fs.existsSync(p)) return null;
      var age = Date.now() - fs.statSync(p).mtimeMs;
      if (age > 86400000) { clearDraft(); return null; } // 24 saatten eskisini at
      var d = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!d || !d.segments || !d.segments.length) return null;
      return d;
    } catch (e) { return null; }
  }

  function clearDraft() {
    try {
      var p = draftPath();
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) {}
  }

  // Klasoru icerigiyle sil. fs.rmSync Node 14.14+, rmdirSync({recursive}) 12.10+:
  // Premiere 14.4'un Node 12.3'unde ikisi de yok, en sonda elle yurunur.
  function rmrf(p) {
    try { if (fs.rmSync) { fs.rmSync(p, { recursive: true, force: true }); return; } } catch (e) {}
    var st;
    try { st = fs.lstatSync(p); } catch (eS) { return; }   // zaten yok
    if (!st.isDirectory()) { try { fs.unlinkSync(p); } catch (e3) {} return; }
    try { fs.readdirSync(p).forEach(function (f) { rmrf(path.join(p, f)); }); } catch (eR) {}
    try { fs.rmdirSync(p); } catch (e4) {}
  }

  // Temp klasöründe biriken eski ses/JSON artıklarını süpür
  function sweepTemp() {
    if (!nodeOK) return 0;
    var n = 0;
    [tmpDir(), path.join(os.tmpdir(), "Suflo"), path.join(os.tmpdir(), "kesit")].forEach(function (dir) {
      try {
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).forEach(function (f) {
          // .srt ASLA silinmez: Premiere içe aktarılan altyazıyı kopyalamaz, diskteki yola
          // referans verir — silinirse kullanıcının projesindeki caption izi kırılır.
          if (/\.srt$/i.test(f)) return;
          var fp = path.join(dir, f);
          // Geçici çalışma KLASÖRLERİ (overlay render, stil önizleme, açılmış güncelleme)
          if (/^(overlay-|suflo-style-preview|guncelleme-)/i.test(f)) {
            try {
              var ds = fs.statSync(fp);
              if (ds.isDirectory() && Date.now() - ds.mtimeMs > 86400000) {
                rmrf(fp); n++;
              }
            } catch (eD) {}
            return;
          }
          if (!/^(cap_|seq_|warmup|montaj_|suflo_|beat_)/i.test(f)) return;
          try {
            if (Date.now() - fs.statSync(fp).mtimeMs > 86400000) { fs.unlinkSync(fp); n++; }
          } catch (e2) {}
        });
      } catch (e) {}
    });
    // ASCII önbelleği (Windows, 8.3 kapalı disk yedeği): ses/çıktı kopyaları birikmesin.
    // .bin modelleri bilerek kalır — her transkripsiyonda 1 GB yeniden kopyalanmasın.
    try {
      var ad = path.join(process.env.ProgramData || "C:\\ProgramData", "Suflo", "ascii-onbellek");
      if (process.platform === "win32" && fs.existsSync(ad)) {
        fs.readdirSync(ad).forEach(function (f) {
          if (/\.bin$/i.test(f)) return;
          var fp2 = path.join(ad, f);
          try { if (Date.now() - fs.statSync(fp2).mtimeMs > 86400000) { rmrf(fp2); n++; } } catch (eA) {}
        });
      }
    } catch (eAs) {}
    if (n) log("temp temizligi: " + n + " dosya silindi");
    return n;
  }

  /* ---------------- HTTP GET (güncelleme kontrolü) ---------------- */

  /*
   * Vekil sunucu (3.3): download() gibi Ayarlar › vekil sunucu / HTTPS_PROXY / NO_PROXY'ye uyar
   * (https hedefe CONNECT tüneli, http hedefe mutlak adresli istek). Yalnız doğrudan bağlantıya izin
   * veren ağlarda sürüm denetimleri (GitHub API) hep başarısız olmasın.
   */
  function httpGet(urlStr, headers) {
    return new Promise(function (resolve0) {
      var bitti = false;
      function resolve(x) { if (!bitti) { bitti = true; resolve0(x); } }
      if (!nodeOK) { resolve({ status: 0, body: "Node erişimi yok" }); return; }
      var proto, u;
      try {
        u = new URL(urlStr);
        proto = require(u.protocol === "http:" ? "http" : "https");
      } catch (e) { resolve({ status: 0, body: String(e) }); return; }
      var hdrs = { "User-Agent": "Suflo-Panel" };
      for (var h in headers) if (headers.hasOwnProperty(h)) hdrs[h] = headers[h];
      var reqOpts = {
        hostname: u.hostname,
        port: u.port || (u.protocol === "http:" ? 80 : 443),
        path: u.pathname + (u.search || ""),
        headers: hdrs
      };
      function fire(extra) {
        if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) reqOpts[k] = extra[k];
        var req = proto.get(reqOpts, function (res) {
          var data = "";
          res.setEncoding("utf8");   // cok baytli harfler (ş, ğ) parca sinirinda bolunmesin
          res.on("data", function (d) { data += d; });
          res.on("end", function () { resolve({ status: res.statusCode, body: data }); });
          res.on("error", function (e2) { resolve({ status: 0, body: String(e2) }); });
        });
        req.on("error", function (e3) { resolve({ status: 0, body: String(e3) }); });
        req.setTimeout(20000, function () { req.destroy(); resolve({ status: 0, body: "zaman aşımı" }); });
      }
      var pu = null;
      try { pu = proxyFor(u); } catch (eP) { pu = null; }
      if (pu && u.protocol === "http:") {
        var h2 = Object.assign({ Host: u.hostname }, hdrs);
        var au = proxyAuth(pu);
        if (au) h2["Proxy-Authorization"] = au;
        reqOpts = { hostname: pu.hostname, port: proxyPort(pu), path: urlStr, headers: h2 };
        proto = require("http");
        fire();
      } else if (pu) {
        connectTunnel(pu, u, function (err, socket) {
          if (err) {
            log("proxy tuneli kurulamadi (httpGet): " + err.message);
            resolve({ status: 0, body: String(err.message || err) });
            return;
          }
          if (bitti) { try { socket.destroy(); } catch (eS) {} return; }
          // hazir socket uzerinden TLS: SNI ve Host icin host/servername sart
          fire({ socket: socket, agent: false, host: u.hostname, servername: u.hostname });
        });
      } else {
        fire();
      }
    });
  }

  /* ---------------- Tanılama günlüğü ---------------- */

  var VERSION = "3.2.0";  // NOT: build sirasinda tools/package.ps1 + kurucu-yap.ps1 bunu manifest'ten OTOMATIK senkronlar; elle bumplarken de guncel tut
  // depo adresi sabit: guncelleme kontrolu ve sorun bildirimi bunu kullanir
  var REPO = "sametcreates/suflo";
  var logBuf = [];

  function log(msg) {
    var t = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    logBuf.push(p(t.getHours()) + ":" + p(t.getMinutes()) + ":" + p(t.getSeconds()) + "  " + msg);
    if (logBuf.length > 300) logBuf.shift();
  }

  function logText() {
    var head = [
      "Suflo v" + VERSION,
      "node: " + (nodeOK ? "ok" : "yok"),
      "ffmpeg: " + (_ffmpeg || "bulunmadı"),
      "yerel motor: " + (whisperLocal() ? "kurulu" : "yok"),
      "motor secimi: " + (loadSettings().provider || "?"),
      "---"
    ];
    return head.join("\n") + "\n" + logBuf.join("\n");
  }

  /* ---------------- Hata rehberi ---------------- */

  /*
   * Ham hata mesajını "şimdi ne yapayım" cümlesiyle zenginleştir.
   * Eşleşme yoksa mesaj AYNEN döner: "Konuşma bulunamadı" gibi normal durumlara
   * çözüm önerisi yapıştırmak güveni azaltır. Sıra önemli: özgül kalıplar önce.
   */
  var HATA_REHBERI = [
    { // eksik Windows bileşeni (0xC0000135: DLL bulunamadı) veya VC++ runtime
      re: /3221225781|-1073741515|0xC0000135|VCRUNTIME|MSVCP\d+\.dll/i,
      tip: "Bir Windows bileşeni eksik görünüyor. Şu adresten Visual C++ paketini kur, " +
        "Premiere'i yeniden başlat: aka.ms/vs/17/release/vc_redist.x64.exe"
    },
    { // eski işlemci (0xC000001D: illegal instruction, AVX yok)
      re: /-1073741795|0xC000001D|illegal instruction/i,
      tip: "İşlemcin bu motor sürümünü desteklemiyor olabilir. Ayarlar'dan ücretsiz " +
        "Groq bulut motorunu dene: aynı kalite, kurulum gerektirmez."
    },
    { // antivirüs / izin: motor exe'si karantinada ya da klasör kilitli
      re: /EPERM|EACCES|EBUSY|access is denied|erişim engellendi|erişim reddedildi|operation not permitted/i,
      tip: MAC
        ? "macOS izin vermemiş olabilir. Sistem Ayarları > Gizlilik ve Güvenlik'e bak; " +
          "sorun sürerse Ayarlar > Destek > Sorun bildir."
        : "Antivirüs motoru engellemiş olabilir. Windows Güvenlik > Virüs koruması > " +
          "Dışlamalar'a şu klasörü ekle: %APPDATA%\\Kesit — sonra motoru Ayarlar'dan yeniden kur."
    },
    { // aranan program yok: ham "spawn ... ENOENT" kullaniciya hicbir sey anlatmiyor
      re: /ENOENT.*spawn|spawn.*ENOENT|is not recognized|bulunamayan komut/i,
      tip: "Gereken yardımcı program bulunamadı. Ayarlar > ffmpeg bölümünden " +
        "\"ffmpeg'i indir ve kur\" düğmesine bas; panel gerekli dosyayı kendisi kurar."
    },
    { // disk dolu
      re: /ENOSPC|no space left|not enough space|yeterli alan/i,
      tip: "Diskte yer kalmamış. 2 GB kadar yer aç, tekrar dene; indirme kaldığı yerden devam eder."
    },
    { // ağ: DNS, kopma, güvenlik duvarı, sertifika, indirme/istek zaman aşımı
      re: /ENOTFOUND|EAI_AGAIN|getaddrinfo|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up|SELF_SIGNED|CERT_|indirme zaman aşımı|timed? ?out/i,
      tip: "İnternet bağlantısında sorun görünüyor. Bağlantıyı kontrol edip tekrar dene; " +
        "indirme kaldığı yerden devam eder. Şirket veya okul ağındaysan Ayarlar'dan vekil sunucu tanımla."
    },
    /*
     * Cıplak "401"/"429" ARAMA: bu sayılar masum mesajlarda da geçiyor
     * ("Ses çok uzun (429 MB)", "401 altyazı satırı hazır") ve kullanıcıyı
     * olmayan bir sorunu kovalamaya yollar. Yalnızca gerçek API kalıpları.
     */
    { // API anahtarı geçersiz
      re: /invalid[_ ]api[_ ]key|API anahtarı geçersiz|\bAPI\s+401\b|geçersiz anahtar/i,
      tip: "API anahtarı geçersiz veya süresi dolmuş. Ayarlar'dan yeni bir Groq anahtarı " +
        "oluştur (ücretsiz, 1 dakika sürer)."
    },
    { // API limiti — captions.js apiError() Türkçe "kotası doldu" üretiyor, ham kalıplar da olabilir
      re: /rate[_ ]limit|\bAPI\s+429\b|quota exceeded|kota(sı)? doldu/i,
      tip: "Bulut motorunun dakikalık sınırına takıldın. 1-2 dakika bekleyip tekrar dene, " +
        "ya da sınırsız kullanım için Ayarlar'dan yerel motoru kur."
    },
    /*
     * Premiere meşgul: modal pencere, render, kilitli host.
     * Yalnızca evalScript köprüsünün ürettiği mesaja bakılır. Çıplak "zaman aşımı"
     * ARANMAZ: aynı ifadeyi HTTP isteği, indirme ve alt süreç zaman aşımları da
     * üretiyor, onlarda kullanıcıyı Premiere'e yollamak yanlış yönlendirme olur.
     */
    {
      re: /Premiere yanıt vermedi/i,
      tip: "Premiere meşgul olabilir. Premiere'e geç, açık iletişim kutusu veya süren " +
        "render varsa kapat, sonra tekrar dene."
    },
    { // motor bozuk / çalışmıyor
      re: /çıktı üretmedi|Motor çalıştırılamadı|motor dosyasi bulunamadi/i,
      tip: "Motor bozulmuş olabilir. Ayarlar'dan yerel motoru yeniden kur. Sorun sürerse " +
        "antivirüs dışlaması ekle ve Ayarlar > Destek > Sorun bildir de günlüğe bakalım."
    }
  ];

  function hataYardimi(e) {
    var m = String(e && e.message ? e.message : (e || ""));
    for (var i = 0; i < HATA_REHBERI.length; i++) {
      if (HATA_REHBERI[i].re.test(m)) return m + "\nÇözüm: " + HATA_REHBERI[i].tip;
    }
    return m;
  }

  /* ---------------- HTTP JSON (Node üzerinden, CORS'suz) ---------------- */

  function httpJson(urlStr, headers, bodyObj) {
    return new Promise(function (resolve) {
      if (!nodeOK) { resolve({ status: 0, body: "Node erişimi yok" }); return; }
      var proto, u, Buf;
      try {
        u = new URL(urlStr);
        proto = require(u.protocol === "http:" ? "http" : "https");
        Buf = require("buffer").Buffer;
      } catch (e) { resolve({ status: 0, body: String(e) }); return; }
      var body = Buf.from(JSON.stringify(bodyObj), "utf8");
      var hdrs = { "Content-Type": "application/json", "Content-Length": body.length };
      for (var h in headers) if (headers.hasOwnProperty(h)) hdrs[h] = headers[h];
      // vekil sunucuya uyar: çeviri, Shorts LLM, davet ve Pro içerik manifesti de vekilden geçer
      vekilliIstek(urlStr, { method: "POST", headers: hdrs }, function (res) {
        var data = "";
        res.setEncoding("utf8");   // cok baytli harfler (ş, ğ) parca sinirinda bolunmesin
        res.on("data", function (d) { data += d; });
        res.on("end", function () { resolve({ status: res.statusCode, body: data }); });
        res.on("error", function (e2) { resolve({ status: 0, body: String(e2) }); });
      }, function (e3, req) {
        if (e3) { resolve({ status: 0, body: String(e3 && e3.message ? e3.message : e3) }); return; }
        req.on("error", function (e4) { resolve({ status: 0, body: String(e4) }); });
        req.setTimeout(300000, function () { req.destroy(); resolve({ status: 0, body: "zaman aşımı" }); });
        req.write(body);
        req.end();
      });
    });
  }

  /* ---------------- Yerel Whisper (whisper.cpp) ---------------- */

  /*
   * Motor ve model klasörü. Windows yolu GERİYE DÖNÜK korunur (kurulu kullanıcılar
   * modellerini yeniden indirmesin); macOS'ta platformun doğru yeri kullanılır.
   */
  function whisperDir() {
    if (!nodeOK) return "";        // tarayici onizlemesi: Node yok
    if (MAC) return path.join(os.homedir(), "Library", "Application Support", "Suflo", "whisper");
    return path.join(os.homedir(), "AppData", "Roaming", "Kesit", "whisper");
  }

  /*
   * Panelin kendi kurdugu ffmpeg'in yeri (whisper klasorunun kardesi).
   * Kullanicilarin cogu "ffmpeg bulunamadi" duvarina carpiyordu: winget her makinede
   * yok, olsa da kurulum PATH'i CALISAN Premiere surecine yansimiyor. Bu yuzden
   * ffmpeg'i motor gibi kendimiz indirip buraya koyuyoruz.
   */
  function ffmpegDir() {
    if (!nodeOK) return "";
    return path.join(path.dirname(whisperDir()), "ffmpeg");
  }

  /*
   * Emoji spritesheet'lerinin yeri (whisper/ffmpeg'in kardeşi). Apple ve
   * Twemoji çizimleri TELİF nedeniyle pakete konamaz; panel ilk kullanımda
   * seti buraya indirir — ffmpeg ve model indirmeleriyle aynı model.
   */
  function emojiSetDir() {
    if (!nodeOK) return "";
    var d = path.join(path.dirname(whisperDir()), "emoji-set");
    try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
  }

  function ffmpegKurulu() {
    if (!nodeOK) return null;
    var p = path.join(ffmpegDir(), MAC ? "ffmpeg" : "ffmpeg.exe");
    try { return fs.existsSync(p) ? p : null; } catch (e) { return null; }
  }

  /*
   * whisper-cli Windows'ta argv'yi char* (ANSI kod sayfasi) okur; kullanici
   * adinda Turkce/aksanli karakter varsa ("BASIN TEKNİK") model/ses yolu
   * bozuk gelir ve motor kod=3221226505 ile coker (issue #7). ffmpeg wmain
   * kullandigi icin etkilenmez — bu koruma yalniz whisper-cli argumanlarina
   * uygulanir. Cozum sirasi: yol zaten ASCII ise dokunma; degilse 8.3 kisa
   * yola cevir (ayni dosyanin ASCII takma adi); 8.3 kapaliysa girdiyi
   * ProgramData altindaki ASCII onbellege bir kez kopyala.
   */
  function asciiMi(s) { return /^[\x00-\x7F]*$/.test(String(s)); }

  var kisaYolOnbellek = {};
  function kisaYol(yol) {
    if (MAC || !nodeOK || !yol || asciiMi(yol)) return yol;
    if (kisaYolOnbellek[yol]) return kisaYolOnbellek[yol];
    try {
      if (!fs.existsSync(yol)) {
        // henuz olusmamis cikti taban adi: var olan klasoru kisalt, adi koru
        var dn = path.dirname(yol), bn = path.basename(yol);
        if (dn === yol) return yol;
        var kdn = kisaYol(dn);
        return (asciiMi(kdn) && asciiMi(bn)) ? path.join(kdn, bn) : yol;
      }
      // execSync komutu cmd'ye genis (UTF-16) iletir; icinde " olamaz cunku
      // Windows dosya adinda " gecersizdir. Basarili 8.3 ciktisi saf ASCII'dir.
      var cikti = cp.execSync('for %I in ("' + yol + '") do @echo %~sI',
        { windowsHide: true, timeout: 10000 }).toString();
      var son = cikti.split(/\r?\n/).filter(function (s) { return s.trim(); }).pop();
      son = (son || "").trim();
      if (son && asciiMi(son) && fs.existsSync(son)) {
        kisaYolOnbellek[yol] = son;
        return son;
      }
    } catch (e) {}
    return yol;
  }

  function asciiOnbellekDir() {
    var kok = process.env.ProgramData || "C:\\ProgramData";
    var d = path.join(kok, "Suflo", "ascii-onbellek");
    try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
  }

  // Girdi dosyasini ASCII-guvenli onbellege kopyalar (8.3 kapali sistem yedegi).
  // Ayni ad+boyut tekrar kopyalanmaz — 1 GB'lik model tek sefer tasinir.
  function asciiKopya(yol) {
    try {
      var st = fs.statSync(yol);
      var ad = path.basename(yol).replace(/[^\x20-\x7E]/g, "_");
      var hedef = path.join(asciiOnbellekDir(), st.size + "-" + ad);
      if (!asciiMi(hedef)) return yol;
      if (!fs.existsSync(hedef) || fs.statSync(hedef).size !== st.size) {
        fs.copyFileSync(yol, hedef);
      }
      return hedef;
    } catch (e) { return yol; }
  }

  /*
   * tur "girdi": var olan dosya — kisa yol, olmazsa kopya.
   * tur "cikti": yazilacak taban ad — yalniz klasor kisaltilir (kopya olmaz;
   * cikti ayni fiziksel klasore dussun ki cagiran outBase + ".json" bulabilsin).
   */
  function guvenliYol(yol, tur) {
    if (MAC || !yol || asciiMi(yol)) return yol;
    var k = kisaYol(yol);
    if (asciiMi(k)) return k;
    if (tur === "girdi") return asciiKopya(yol);
    return yol;
  }

  // macOS'ta motor Homebrew ile kurulur; CEP'in PATH'i eksik olabildiği için tam yol aranır
  function macWhisperYollari() {
    return [
      "/opt/homebrew/bin/whisper-cli",   // Apple Silicon
      "/usr/local/bin/whisper-cli",      // Intel
      "/opt/local/bin/whisper-cli"       // MacPorts
    ];
  }

  function brewYolu() {
    if (!nodeOK) return null;
    var adaylar = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];
    for (var i = 0; i < adaylar.length; i++) {
      try { if (fs.existsSync(adaylar[i])) return adaylar[i]; } catch (e) {}
    }
    return null;
  }

  /*
   * brew komutu: { exe, args } ya da brew yoksa null. Premiere Rosetta'da açıldıysa çocuk süreç x86_64
   * başlar; /opt/homebrew'daki brew "Cannot install under Rosetta 2 in ARM default prefix" deyip durur.
   * O durumda arch -arm64 ile yerel mimaride çağrılır.
   */
  function brewKomutu(args) {
    var brew = brewYolu();
    if (!brew) return null;
    args = args || [];
    if (brew.indexOf("/opt/homebrew/") === 0 && rosettaAltinda()) return { exe: "/usr/bin/arch", args: ["-arm64", brew].concat(args) };
    return { exe: brew, args: args };
  }

  /*
   * Kurulu yerel motoru bul: { exe, model, dir } veya null.
   * opts.skipModel: yalnız çalıştırılabilir aranır (kurulum sırasında gerekir).
   * Model seçimi KEngine'e bırakılır; burada yalnız yedek tarama yapılır.
   */
  function whisperLocal(opts) {
    opts = opts || {};
    if (!nodeOK) return null;
    try {
      var dir = whisperDir();
      var exe = null;
      var names = MAC
        ? ["whisper-cli", "main", "whisper"]
        : ["whisper-cli.exe", "main.exe", "whisper.exe"];
      // macOS: motor Homebrew'dan gelir, kendi klasörümüzde durmaz
      if (MAC) {
        var my = macWhisperYollari();
        for (var mi2 = 0; mi2 < my.length; mi2++) {
          try { if (fs.existsSync(my[mi2])) { exe = my[mi2]; break; } } catch (eM) {}
        }
      }
      for (var i = 0; !exe && i < names.length; i++) {
        var c = path.join(dir, names[i]);
        if (fs.existsSync(c)) { exe = c; break; }
      }
      if (!exe) {
        // zip bazen alt klasore acilir
        var subs = fs.readdirSync(dir);
        for (var si = 0; si < subs.length && !exe; si++) {
          for (var ni = 0; ni < names.length; ni++) {
            var c2 = path.join(dir, subs[si], names[ni]);
            try { if (fs.existsSync(c2)) { exe = c2; break; } } catch (eS) {}
          }
        }
      }
      if (!exe) return null;
      if (opts.skipModel) return { exe: exe, model: null, dir: dir };

      // model: once KEngine'in sectigi, yoksa klasordeki en buyuk ggml
      var model = null;
      try {
        if (window.KEngine) model = window.KEngine.activeModelPath();
      } catch (eE) {}
      if (!model || !fs.existsSync(model)) {
        var mdir = path.join(dir, "models");
        if (!fs.existsSync(mdir)) return null;
        var files = fs.readdirSync(mdir);
        var best = 0;
        for (var mi = 0; mi < files.length; mi++) {
          if (!/^ggml-.*\.bin$/i.test(files[mi])) continue;
          if (/silero/i.test(files[mi])) continue; // VAD modeli transkripsiyon modeli degil
          var p = path.join(mdir, files[mi]);
          var sz = 0;
          try { sz = fs.statSync(p).size; } catch (eS2) {}
          if (sz > 20000000 && sz > best) { best = sz; model = p; }
        }
      }
      if (!model) return null;
      return { exe: exe, model: model, dir: dir };
    } catch (e) { return null; }
  }

  /* ---------------- Vekil sunucu (proxy) ---------------- */

  function proxyFor(u) {
    var s = loadSettings();
    var raw = String(s.proxyUrl || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "").trim();
    if (!raw) return null;
    var host = String(u.hostname).toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return null;
    var noP = String(s.noProxy || process.env.NO_PROXY || "").split(",");
    for (var i = 0; i < noP.length; i++) {
      var pat = noP[i].trim().toLowerCase().replace(/^\./, "");
      if (!pat) continue;
      if (pat === "*" || host === pat || host.slice(-(pat.length + 1)) === "." + pat) {
        log("proxy atlandi (NO_PROXY): " + host);
        return null;
      }
    }
    // Semasiz girdiyi normalize et: new URL("proxy.local:8080") hata vermez ama hostname
    // bos kalir ve istek sessizce 127.0.0.1:8080'e gider.
    if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(raw)) raw = "http://" + raw;
    try {
      var pu = new URL(raw);
      if (!pu.hostname) throw new Error("adreste host yok");
      // URL şemanın varsayılan portunu siler (new URL("http://g:80").port === ""): açıkça yazılan port
      // ham metinden okunur. Port yazılmadıysa eskisi gibi 8080.
      var acik = /^[a-z][a-z0-9+.\-]*:\/\/(?:[^@\/?#]*@)?(?:\[[^\]]*\]|[^:\/?#]*):(\d+)/i.exec(raw);
      pu.vekilPort = pu.port ? Number(pu.port) : (acik ? Number(acik[1]) : 8080);
      return pu;
    } catch (e) {
      // Ham adresi YAZMA: kullanici:sifre iceriyor olabilir ve gunluk destege gonderiliyor
      log("proxy adresi anlasilmadi, dogrudan baglaniliyor (" + e.message + ")");
      return null;
    }
  }

  function proxyAuth(pu) {
    if (!pu.username) return null;
    var Buf = require("buffer").Buffer;
    return "Basic " + Buf.from(decodeURIComponent(pu.username) + ":" +
      decodeURIComponent(pu.password || "")).toString("base64");
  }

  /*
   * https hedef icin CONNECT tuneli. Duz absolute-URI GET yalnizca http:// icin gecerlidir;
   * katalogdaki tum adresler https oldugu icin tunel olmadan Squid/kurumsal proxy'ler
   * 400/403/501 doner ve HTTPS_PROXY tanimli makinelerde kurulum sessizce bozulur.
   */
  // Vekilin portu: açık port (":80" dahil, proxyFor ham metinden okur), yoksa 8080
  function proxyPort(pu) { return Number(pu && pu.vekilPort) || Number(pu && pu.port) || 8080; }

  /*
   * Vekil sunucuya uyan istek (httpUpload, httpJson, Pro lisans ve içerik istekleri): Ayarlar › vekil
   * sunucu / HTTPS_PROXY / NO_PROXY. https hedefe CONNECT tüneli, http hedefe mutlak adresli istek, vekil
   * yoksa doğrudan. secenek: { method, headers }; yanit(res) http.request geri çağrısı; hazir(err, req):
   * istek yazılıp end edilmeye hazır (tünel kurulurken iptal edilen çağıran req'i yok edebilir).
   */
  function vekilliIstek(urlStr, secenek, yanit, hazir) {
    var u;
    try { u = new URL(urlStr); } catch (e) { hazir(e); return; }
    secenek = secenek || {};
    var guvenli = u.protocol !== "http:";
    var proto = require(guvenli ? "https" : "http");
    var opts = { hostname: u.hostname, port: u.port || (guvenli ? 443 : 80), path: u.pathname + (u.search || ""),
      method: secenek.method || "GET", headers: secenek.headers || {} };
    var pu = null;
    try { pu = proxyFor(u); } catch (eP) { pu = null; }
    if (pu && !guvenli) {
      var h2 = Object.assign({ Host: u.host }, opts.headers);
      var au = proxyAuth(pu);
      if (au) h2["Proxy-Authorization"] = au;
      try { hazir(null, require("http").request({ hostname: pu.hostname, port: proxyPort(pu), path: urlStr, method: opts.method, headers: h2 }, yanit)); }
      catch (e2) { hazir(e2); }
      return;
    }
    if (pu) {
      connectTunnel(pu, u, function (err, socket) {
        if (err) { log("proxy tuneli kurulamadi: " + err.message); hazir(err); return; }
        // hazir socket uzerinden TLS: SNI ve Host icin servername sart
        opts.socket = socket; opts.agent = false; opts.servername = u.hostname;
        try { hazir(null, proto.request(opts, yanit)); }
        catch (e3) { try { socket.destroy(); } catch (eS) {} hazir(e3); }
      });
      return;
    }
    try { hazir(null, proto.request(opts, yanit)); } catch (e4) { hazir(e4); }
  }

  function connectTunnel(pu, u, cb) {
    var hdrs = {};
    var au = proxyAuth(pu);
    if (au) hdrs["Proxy-Authorization"] = au;
    var settled = false;
    function done(e, s) { if (!settled) { settled = true; cb(e, s); } }
    var cr = require("http").request({
      host: pu.hostname,
      port: proxyPort(pu),
      method: "CONNECT",
      path: u.hostname + ":" + (u.port || 443),
      headers: hdrs
    });
    cr.on("connect", function (res, socket) {
      if (res.statusCode !== 200) {           // 407 vb. yuzeye ciksin
        try { socket.destroy(); } catch (e1) {}
        done(new Error("Proxy CONNECT reddetti: HTTP " + res.statusCode));
        return;
      }
      done(null, socket);
    });
    cr.on("error", function (e) { done(e); });
    cr.setTimeout(30000, function () { cr.destroy(); done(new Error("Proxy CONNECT zaman asimi")); });
    cr.end();
  }

  /*
   * Yonlendirme takip eden, kaldigi yerden devam eden dosya indirici.
   * .part dosyasina yazar, tamamlaninca atomik olarak nihai ada tasir.
   * resumeFrom: ic kullanim (byte offset).
   * meta: { key, expectedMB, iptal } — key mantiksal kimliktir; yarim dosya yalnizca ayni
   *   kimlige devam eder, boylece aynalar arasi devam korunur ama farkli dosyalar
   *   (ornegin CPU/GPU derlemeleri) birbirine eklenmez.
   *   iptal: K.iptalJetonu() — iptalde istek kesilir, .part KORUNUR (sonraki deneme kaldigi
   *   yerden devam eder) ve { ok: false, iptal: true, kept } doner.
   */
  function download(urlStr, destPath, onProgress, redirects, resumeFrom, meta) {
    redirects = redirects || 0;
    meta = meta || {};
    return new Promise(function (resolve0) {
      if (!nodeOK) { resolve0({ ok: false, error: "Node erişimi yok" }); return; }
      var jeton = meta.iptal && typeof meta.iptal.dinle === "function" ? meta.iptal : null;
      var birak = null, bitti = false, aktifReq = null, aktifRes = null, aktifOut = null;
      function resolve(x) {
        if (bitti) return;
        bitti = true;
        if (birak) { birak(); birak = null; }
        resolve0(x);
      }
      if (redirects > 6) { resolve({ ok: false, error: "Çok fazla yönlendirme" }); return; }
      var u, proto;
      try {
        u = new URL(urlStr);
        proto = require(u.protocol === "http:" ? "http" : "https");
      } catch (e) { resolve({ ok: false, error: String(e) }); return; }

      var partPath0 = destPath + ".part";
      var sidePath = destPath + ".part.json";
      var side = null;
      try {
        if (fs.existsSync(sidePath)) side = JSON.parse(fs.readFileSync(sidePath, "utf8"));
      } catch (eS) {}

      function partSize() {
        try { return fs.existsSync(partPath0) ? fs.statSync(partPath0).size : 0; } catch (e) { return 0; }
      }
      function dropPart() {
        try { fs.unlinkSync(partPath0); } catch (e) {}
        try { fs.unlinkSync(sidePath); } catch (e) {}
      }
      function writeSide(total) {
        if (!meta.key) return;
        try {
          fs.writeFileSync(sidePath, JSON.stringify({ key: meta.key, total: total || 0 }), "utf8");
        } catch (e) {}
      }

      // iptal: istegi ve yazmayi kes, yarim dosyayi koru
      if (jeton) {
        if (jeton.iptalEdildi) { resolve({ ok: false, iptal: true, error: "İptal edildi", kept: partSize() }); return; }
        birak = jeton.dinle(function () {
          try { if (aktifRes) aktifRes.destroy(); } catch (e1) {}
          try { if (aktifReq) aktifReq.destroy(); } catch (e2) {}
          try { if (aktifOut) aktifOut.destroy(); } catch (e3) {}
          var kalanIptal = partSize();
          log("indirme iptal edildi, yarim dosya korunuyor: " + kalanIptal + " bayt");
          resolve({ ok: false, iptal: true, error: "İptal edildi", kept: kalanIptal });
        });
      }

      // ilk cagrida yarim dosya varsa kaldigi yerden devam etmeyi dene
      if (resumeFrom === undefined) {
        resumeFrom = 0;
        try {
          if (fs.existsSync(partPath0)) {
            var half = fs.statSync(partPath0).size;
            if (meta.key && side && side.key && side.key !== meta.key) {
              // .part baska bir indirmeye ait (ornegin yarida kalmis GPU derlemesi).
              // Uzerine eklemek bozuk arsiv uretir.
              dropPart();
              log("yarim dosya baska indirmeye ait (" + side.key + "), bastan indiriliyor");
            } else if (half > 65536) {
              resumeFrom = half;
              log("indirme devam ediyor: " + half + " bayttan");
            }
          }
        } catch (eR0) {}
      }

      var hdrs = { "User-Agent": "Suflo-Panel" };
      if (resumeFrom > 0) hdrs.Range = "bytes=" + resumeFrom + "-";
      var reqOpts = {
        hostname: u.hostname,
        port: u.port || (u.protocol === "http:" ? 80 : 443),
        path: u.pathname + (u.search || ""),
        headers: hdrs
      };

      function onRes(res) {
        if (bitti) { res.resume(); return; }
        aktifRes = res;
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          // Goreli Location'i tarayici kuraliyla coz: port ve yol korunur
          var next;
          try { next = new URL(res.headers.location, urlStr).href; }
          catch (eLoc) { next = u.protocol + "//" + u.host + res.headers.location; }
          download(next, destPath, onProgress, redirects + 1, resumeFrom, meta).then(resolve);
          return;
        }
        // 206 = kaldigi yerden devam kabul edildi, 200 = bastan gonderiyor
        var resuming = (res.statusCode === 206 && resumeFrom > 0);
        if (resuming) {
          // Devam dogrulamasi: sunucunun bildirdigi aralik bekledigimizle uyusmali.
          // Uyusmuyorsa yarim dosya baska bir surume/aynaya ait — birlestirme bozuk cikar.
          var cr = /bytes\s+(\d+)-\d*\/(\d+)/i.exec(String(res.headers["content-range"] || ""));
          var basla = cr ? Number(cr[1]) : -1;
          var toplam = cr ? Number(cr[2]) : 0;
          var uyumsuz = (cr && basla !== resumeFrom) ||
            (toplam && toplam <= resumeFrom) ||
            (toplam && side && side.total && side.total !== toplam);
          if (uyumsuz) {
            res.resume();
            dropPart();
            log("yarim dosya bu surumle uyusmuyor (content-range: " +
              (res.headers["content-range"] || "yok") + "), bastan indiriliyor");
            download(urlStr, destPath, onProgress, redirects, 0, meta).then(resolve);
            return;
          }
        }
        if (res.statusCode !== 200 && !resuming) {
          res.resume();
          // SADECE Range'e ozel bir ret ise yarim dosyayi at. 403/429/5xx Range ile
          // ilgisizdir: .part KORUNUR, sonraki deneme kaldigi yerden devam eder.
          var rangeRed = (res.statusCode === 416 || res.statusCode === 400 || res.statusCode === 501);
          if (resumeFrom > 0 && rangeRed) {
            dropPart();
            log("sunucu Range istegini reddetti (HTTP " + res.statusCode + "), bastan indiriliyor");
            download(urlStr, destPath, onProgress, redirects, 0, meta).then(resolve);
            return;
          }
          var kalan = partSize();
          if (kalan > 0) {
            log("gecici sunucu hatasi (HTTP " + res.statusCode + "), yarim dosya korunuyor: " +
              kalan + " bayt");
          }
          resolve({ ok: false, error: "HTTP " + res.statusCode, kept: kalan });
          return;
        }
        var partial = Number(res.headers["content-length"] || 0);
        var base = resuming ? resumeFrom : 0;
        var total = partial ? base + partial : 0;
        if (!resuming) writeSide(total);
        // Katalog boyutuyla kaba denetim (checksum yok): sapma varsa uyar, engelleme.
        if (total && meta.expectedMB) {
          var sapma = Math.abs(total - meta.expectedMB * 1048576) / (meta.expectedMB * 1048576);
          if (sapma > 0.15) {
            log("uyari: beklenen boyuttan sapma - " + meta.key + " " +
              Math.round(total / 1048576) + " MB (katalog: " + meta.expectedMB + " MB)");
          }
        }
        var got = base;
        // once .part'a yaz; ancak butunlugu dogrulaninca nihai ada tasi —
        // yarim indirme asla "kurulu model" sanilmasin
        var partPath = partPath0;
        var out;
        try { out = fs.createWriteStream(partPath, resuming ? { flags: "a" } : undefined); }
        catch (eO) { resolve({ ok: false, error: String(eO) }); return; }
        aktifOut = out;
        function fail(msg, keepPart) {
          try { out.destroy(); } catch (e1) {}
          // ag hatasinda .part'i KORU — sonraki denemede kaldigi yerden devam eder
          if (!keepPart) dropPart();
          resolve({ ok: false, error: msg, kept: keepPart ? partSize() : 0 });
        }
        res.on("data", function (d) {
          got += d.length;
          if (onProgress && total) onProgress(got / total, got);
        });
        res.pipe(out);
        out.on("finish", function () {
          out.close(function () {
            if (total > 0 && got !== total) { fail("Eksik indirme: " + got + "/" + total, true); return; }
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              fs.renameSync(partPath, destPath);
              try { fs.unlinkSync(sidePath); } catch (e3) {}
              resolve({ ok: true, bytes: got });
            } catch (eR2) { fail(String(eR2)); }
          });
        });
        res.on("error", function (eR) { fail(String(eR), true); });
        out.on("error", function (eW) { fail(String(eW), true); });
      }

      function fire(extra) {
        if (bitti) {
          // proxy tuneli kurulurken iptal edildi: acik soketi birak
          try { if (extra && extra.socket) extra.socket.destroy(); } catch (eS) {}
          return;
        }
        if (extra) for (var k in extra) reqOpts[k] = extra[k];
        var req = proto.get(reqOpts, onRes);
        aktifReq = req;
        // ag hatasinda .part korunur ki sonraki deneme kaldigi yerden devam etsin
        req.on("error", function (eq) {
          resolve({ ok: false, error: String(eq), kept: partSize() });
        });
        req.setTimeout(1800000, function () {
          req.destroy();
          resolve({ ok: false, error: "indirme zaman aşımı", kept: partSize() });
        });
      }

      var pu = proxyFor(u);
      if (pu && u.protocol === "http:") {
        // http hedefte absolute-URI forward-proxy istegi GECERLIDIR
        var h2 = Object.assign({ Host: u.hostname }, hdrs);
        var au2 = proxyAuth(pu);
        if (au2) h2["Proxy-Authorization"] = au2;
        reqOpts = { hostname: pu.hostname, port: proxyPort(pu), path: urlStr, headers: h2 };
        proto = require("http");
        log("proxy (http hedef): " + pu.hostname + ":" + proxyPort(pu));
        fire();
      } else if (pu) {
        log("proxy CONNECT tuneli: " + pu.hostname + ":" + proxyPort(pu) + " -> " + u.hostname);
        connectTunnel(pu, u, function (err, socket) {
          if (err) {
            log("proxy tuneli kurulamadi: " + err.message);
            resolve({ ok: false, error: err.message, kept: partSize() });
            return;
          }
          // hazir socket uzerinden TLS: SNI ve Host icin host/servername sart
          fire({ socket: socket, agent: false, host: u.hostname, servername: u.hostname });
        });
      } else {
        fire();
      }
    });
  }

  async function unzip(zipPath, destDir) {
    try { fs.mkdirSync(destDir, { recursive: true }); } catch (eM) {}
    if (MAC) {
      // macOS: unzip ve bsdtar sistemde hazir gelir
      var u = await run("/usr/bin/unzip", ["-o", "-q", zipPath, "-d", destDir], { timeout: 180000 });
      if (u.code === 0) return true;
      var t = await run("/usr/bin/tar", ["-xf", zipPath, "-C", destDir], { timeout: 180000 });
      if (t.code === 0) return true;
      log("mac arsiv acilamadi: " + String(u.stderr || t.stderr).slice(0, 200));
      return false;
    }
    // Windows'un yerlesik bsdtar'i: argv ile gectigimiz icin tirnak sorunu yok
    var tarExe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    if (fs.existsSync(tarExe)) {
      var r = await run(tarExe, ["-xf", zipPath, "-C", destDir], { timeout: 180000 });
      if (r.code === 0) return true;
    }
    // PowerShell fallback — tek tirnaklari ikileyerek kacir (O'Neil gibi kullanici adlari).
    // -ErrorAction Stop + try/catch sart: Expand-Archive bozuk arsivde sonlandirmayan hata
    // uretip yine exit 0 donuyor, yani cikis koduna guvenmek bozuk kurulumu "basarili" sayar.
    function q(s) { return String(s).replace(/'/g, "''"); }
    var r2 = await run("powershell", [
      "-NoProfile", "-Command",
      "try { Expand-Archive -LiteralPath '" + q(zipPath) + "' -DestinationPath '" + q(destDir) +
      "' -Force -ErrorAction Stop } catch { exit 1 }"
    ], { timeout: 180000 });
    return r2.code === 0;
  }

  /* ---------------- ffmpeg ---------------- */

  var _ffmpeg = null;

  function ffmpegCandidates() {
    var list = [];
    var s = loadSettings();
    if (s.ffmpeg) list.push(s.ffmpeg);
    // Panelin kendi kurdugu kopya EN ONCE denenir: onu biz koyduk, kesin calisir
    var bizim = ffmpegKurulu();
    if (bizim) list.push(bizim);
    list.push("ffmpeg");
    if (nodeOK && MAC) {
      // CEP'in spawn ortaminda PATH genelde /usr/bin ile sinirli: tam yol sart
      list.push("/opt/homebrew/bin/ffmpeg");   // Apple Silicon Homebrew
      list.push("/usr/local/bin/ffmpeg");      // Intel Homebrew
      list.push("/opt/local/bin/ffmpeg");      // MacPorts
      list.push("/usr/bin/ffmpeg");
      return list;
    }
    if (nodeOK) {
      var home = os.homedir();
      // Windows'ta spawn PATHEXT'i uygulamaz: uzantisiz "ffmpeg" bulunmayabilir
      list.push("ffmpeg.exe");
      list.push(path.join(home, "AppData", "Local", "Microsoft", "WinGet", "Links", "ffmpeg.exe"));
      // winget bazen Links symlink'ini olusturmaz; paket klasorunu dogrudan tara
      try {
        var pkgRoot = path.join(home, "AppData", "Local", "Microsoft", "WinGet", "Packages");
        var pkgs = fs.readdirSync(pkgRoot);
        for (var pi = 0; pi < pkgs.length; pi++) {
          if (pkgs[pi].indexOf("FFmpeg") === -1 && pkgs[pi].indexOf("ffmpeg") === -1) continue;
          var inner = fs.readdirSync(path.join(pkgRoot, pkgs[pi]));
          for (var ii = 0; ii < inner.length; ii++) {
            var cand = path.join(pkgRoot, pkgs[pi], inner[ii], "bin", "ffmpeg.exe");
            if (fs.existsSync(cand)) list.push(cand);
          }
        }
      } catch (eW) {}
      list.push("C:\\ffmpeg\\bin\\ffmpeg.exe");
      list.push("C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe");
      // diger paket yoneticileri: kullanici zaten kurmus olabilir
      list.push("C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe");
      list.push(path.join(home, "scoop", "shims", "ffmpeg.exe"));
      /*
       * Adobe'da CLI ARANMAZ: Premiere/Media Encoder yalnizca libavcodec.dll gibi
       * KUTUPHANELERI dagitiyor, cagirabilecegimiz bir ffmpeg.exe koymuyor
       * (2026 surumleriyle dolu bir kurulumda ozyinelemeli arama sifir sonuc verdi).
       */
    }
    return list;
  }

  /*
   * libass (subtitles/ass filtresi) olan ffmpeg tercih edilir: Altyazi Efektleri, kanca
   * basligi ve stil onizlemesi onsuz calismaz. Homebrew'un sade "ffmpeg"i gibi
   * libass'siz bir derleme yalniz baska aday yoksa secilir; _libass=false olur.
   */
  var _libass = null;
  async function libassVar(aday) {
    var r = await run(aday, ["-hide_banner", "-filters"], { timeout: 15000 });
    return /\ssubtitles\s/.test(String(r.stdout || "") + String(r.stderr || ""));
  }
  function ffmpegLibass() { return _libass; }
  // Stilli islemler oncesi: libass yoksa kullaniciya ne yapacagini soyleyen mesaj, varsa ""
  function libassUyarisi() {
    return _libass === false ? "Bu ffmpeg altyazı çizemiyor (libass yok — örn. Homebrew'un sade ffmpeg'i). " +
      "Ayarlar → ffmpeg'den Suflo'nun ffmpeg'ini kur." : "";
  }

  async function findFfmpeg(force) {
    if (_ffmpeg && !force) return _ffmpeg;
    var cands = ffmpegCandidates();
    var yedek = null;
    for (var i = 0; i < cands.length; i++) {
      /*
       * Mutlak yollar once diskte yoklanir: olmayan bir dosya icin surec baslatmak
       * bosuna. Cikplak "ffmpeg"/"ffmpeg.exe" isimleri PATH'ten cozulecegi icin
       * bu kontrolden muaf. Zaman asimi kisa: -version aninda doner, takilirsa
       * on iki adayin her biri varsayilan bes dakikayi yiyip paneli kilitlerdi.
       */
      var aday = cands[i];
      /*
       * DIKKAT: fs.existsSync Windows'ta "App Execution Alias" dosyalari icin
       * YALAN SOYLER — calisan bir programda bile false doner, statSync ise
       * EACCES firlatir (WindowsApps ve WinGet\Links altindaki 0 baytlik
       * reparse point'ler boyledir). O yollari asla diskte yoklamiyoruz;
       * yoklarsak calisan bir ffmpeg'i "yok" sayip atlariz.
       */
      if (nodeOK && /[\\\/]/.test(aday) && !/WindowsApps|WinGet/i.test(aday)) {
        try { if (!fs.existsSync(aday)) continue; } catch (eX) {}
      }
      var r = await run(aday, ["-version"], { timeout: 15000 });
      if (r.code === 0 && /ffmpeg version/i.test(r.stdout + r.stderr)) {
        if (await libassVar(aday)) {
          _ffmpeg = aday; _libass = true;
          return _ffmpeg;
        }
        if (!yedek) yedek = aday;   // calisiyor ama libass'siz: daha iyisi yoksa bu
      }
    }
    _ffmpeg = yedek;
    _libass = yedek ? false : null;
    if (yedek) log("[ffmpeg] libass'siz derleme secildi: " + yedek);
    return _ffmpeg;
  }

  /* ---------------- Dosya yardımcıları ---------------- */

  var AUDIO_EXT = [".wav", ".mp3", ".aif", ".aiff", ".m4a", ".flac", ".ogg", ".wma"];
  var VISUAL_EXT = [".png", ".webp", ".gif", ".jpg", ".jpeg"];

  function isAudio(f) {
    var l = f.toLowerCase();
    for (var i = 0; i < AUDIO_EXT.length; i++) if (l.slice(-AUDIO_EXT[i].length) === AUDIO_EXT[i]) return true;
    return false;
  }

  function isVisual(f) {
    var l = f.toLowerCase();
    for (var i = 0; i < VISUAL_EXT.length; i++) if (l.slice(-VISUAL_EXT[i].length) === VISUAL_EXT[i]) return true;
    return false;
  }

  function walkAudio(dir, limit, depth) {
    var out = [];
    if (!nodeOK) return out;
    limit = limit || 4000;
    depth = depth === undefined ? 6 : depth;
    if (depth < 0) return out;
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (var i = 0; i < entries.length; i++) {
      if (out.length >= limit) break;
      var e = entries[i];
      var full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.charAt(0) === ".") continue;
        out = out.concat(walkAudio(full, limit - out.length, depth - 1));
      } else if (isAudio(e.name)) {
        out.push(full);
      }
    }
    return out;
  }

  // Emoji Assets ve ilerideki gorsel kutuphaneleri icin guvenli, sinirli tarama.
  // Gizli klasor/dosyalar atlanir; arsiv kullanicinin oldugu yerde kalir.
  function walkVisual(dir, limit, depth) {
    var out = [];
    if (!nodeOK) return out;
    limit = limit || 6000;
    depth = depth === undefined ? 10 : depth;
    if (depth < 0) return out;
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (var i = 0; i < entries.length; i++) {
      if (out.length >= limit) break;
      var entry = entries[i];
      if (!entry || entry.name.charAt(0) === ".") continue;
      var full = path.join(dir, entry.name);
      if (entry.isDirectory()) out = out.concat(walkVisual(full, limit - out.length, depth - 1));
      else if (isVisual(entry.name)) out.push(full);
    }
    return out;
  }

  function tmpDir() {
    if (!nodeOK) return "";
    var d = path.join(os.tmpdir(), "kesit");
    try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
  }

  /*
   * Kalıcı SRT klasörü. Premiere içe aktardığı altyazıyı kopyalamaz, diskteki yola
   * referans verir; bu yüzden altyazı ASLA temp'e (ne bizim süpürgemizin ne Windows
   * Depolama Alanı Sensörü'nün eline geçen yere) yazılmamalı.
   */
  function srtDir() {
    if (!nodeOK) return "";
    var p = settingsPath();
    if (!p) return tmpDir();                        // son çare
    var d = path.join(path.dirname(p), "srt");
    try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
  }

  return {
    cs: cs,
    nodeOK: nodeOK,
    fs: fs, path: path, os: os,
    call: call,
    hostMesgul: hostMesgul,
    run: run,
    iptalJetonu: iptalJetonu,
    iptalHatasi: iptalHatasi,
    iptalTikiGecerli: iptalTikiGecerli,
    baslatTikiGecerli: baslatTikiGecerli,
    IPTAL_ACILIS_MS: IPTAL_ACILIS_MS,
    settingsPath: settingsPath,
    extensionPath: extensionPath,
    httpUpload: httpUpload,
    httpJson: httpJson,
    vekilliIstek: vekilliIstek,
    httpGet: httpGet,
    log: log,
    logText: logText,
    hataYardimi: hataYardimi,
    VERSION: VERSION,
    REPO: REPO,
    saveDraft: saveDraft,
    loadDraft: loadDraft,
    clearDraft: clearDraft,
    sweepTemp: sweepTemp,
    rmrf: rmrf,
    whisperLocal: whisperLocal,
    guvenliYol: guvenliYol,
    whisperDir: whisperDir,
    ffmpegDir: ffmpegDir,
    ffmpegKurulu: ffmpegKurulu,
    download: download,
    unzip: unzip,
    findFfmpeg: findFfmpeg,
    ffmpegLibass: ffmpegLibass,
    libassUyarisi: libassUyarisi,
    settings: loadSettings,
    saveSettings: saveSettings,
    surecSayisi: surecSayisi,
    ayarDosyasiVardi: function () { loadSettings(); return _ayarDosyasiVardi; },
    walkAudio: walkAudio,
    isAudio: isAudio,
    walkVisual: walkVisual,
    isVisual: isVisual,
    tmpDir: tmpDir,
    srtDir: srtDir,
    emojiSetDir: emojiSetDir,
    MAC: MAC,
    WIN: WIN,
    macMetal: macMetal,
    brewYolu: brewYolu,
    brewKomutu: brewKomutu,
    rosettaAltinda: rosettaAltinda
  };
})();
