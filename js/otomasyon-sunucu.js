/*
 * Suflo — Yapay zekâ köprüsü (MCP) panel sunucusu (3.4, Deneysel, varsayılan KAPALI)
 *
 * MCP istemcisi ⇄ stdio ⇄ mcp/suflo-mcp.js ⇄ HTTP POST 127.0.0.1 ⇄ BU SUNUCU ⇄ panel eylemleri.
 *
 * Güvenlik modeli (docs/mcp-guvenlik.html):
 *  - yalnız 127.0.0.1'e bağlanır, rastgele port; 0.0.0.0 asla
 *  - her açılışta yeni 32 baytlık jeton; bağlantı dosyası otomasyon.json (0600, tmp+rename),
 *    kapanışta silinir
 *  - yalnız POST /v1/eylem; Host = 127.0.0.1:<port> (DNS rebinding); Origin/Referer/Sec-Fetch-*
 *    ya da Upgrade varsa (tarayıcı) 403; CORS başlığı hiç gönderilmez, OPTIONS 403
 *  - Content-Type application/json; Authorization: Bearer <jeton> (timingSafeEqual)
 *  - gövde en çok 256 KB, 30 sn okuma süresi; dakikada en çok 120 çağrı; aynı anda tek eylem,
 *    kuyrukta en çok 4
 *  - yalnız js/otomasyon.js listesindeki eylemler; yaz/yıkıcı eylemler "Düzenlemeye izin ver"
 *    ister, yıkıcılar ayrıca panelde onay kartı (60 sn'de yanıt yoksa reddedilir)
 *  - 30 dakika çağrı gelmezse kendiliğinden kapanır
 *
 * Saf Node (http/crypto/fs/path enjekte edilebilir): DOM'a dokunmaz, testte gerçek loopback
 * sunucusuyla çalışır. CEF 74 / Node 12.3 uyumlu.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloOtomasyonSunucu = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (root) {
  "use strict";

  var GOVDE_SINIRI = 256 * 1024;
  var OKUMA_SURESI = 30000;
  var DAKIKA_SINIRI = 120;
  var KUYRUK_SINIRI = 4;
  var ONAY_SURESI = 60000;
  var BOSTA_KAPANMA = 30 * 60000;
  var MESGUL_BEKLEME = 30000;
  var YOL = "/v1/eylem";

  function req(ad) { try { return typeof require === "function" ? require(ad) : null; } catch (e) { return null; } }

  function OT() {
    if (root && root.SufloOtomasyon) return root.SufloOtomasyon;
    return req("./otomasyon.js");
  }

  function olustur(s) {
    s = s || {};
    var http = s.http || req("http");
    var crypto = s.crypto || req("crypto");
    var fs = s.fs || req("fs");
    var path = s.path || req("path");
    var O = s.otomasyon || OT();
    var saat = typeof s.saat === "function" ? s.saat : function () { return Date.now(); };
    var dosya = s.dosya || "";
    var dakikaSiniri = typeof s.dakikaSiniri === "number" ? s.dakikaSiniri : DAKIKA_SINIRI;
    var kuyrukSiniri = typeof s.kuyrukSiniri === "number" ? s.kuyrukSiniri : KUYRUK_SINIRI;
    var onaySuresi = typeof s.onaySuresi === "number" ? s.onaySuresi : ONAY_SURESI;
    var bostaKapanma = typeof s.bostaKapanma === "number" ? s.bostaKapanma : BOSTA_KAPANMA;
    var mesgulBekleme = typeof s.mesgulBekleme === "number" ? s.mesgulBekleme : MESGUL_BEKLEME;
    var govdeSiniri = typeof s.govdeSiniri === "number" ? s.govdeSiniri : GOVDE_SINIRI;
    var okumaSuresi = typeof s.okumaSuresi === "number" ? s.okumaSuresi : OKUMA_SURESI;

    // Panel tarafı (enjekte): yurut(ad, args, {deneme}) -> Promise<sonuc>
    var yurut = s.yurut || function () { return Promise.reject(new Error("yurutucu yok")); };
    var mesgulMu = s.mesgulMu || function () { return false; };
    var izinler = s.izinler || function () { return { duzenleme: false, onay: true }; };
    var onayIste = s.onayIste || function () { return Promise.resolve(false); };
    var proIzin = s.proIzin || function () { return { ok: false, deneme: false }; };
    var kayit = s.kayit || function () {};
    var log = s.gunluk || function () {};
    var onKapandi = s.onKapandi || function () {};

    var sunucu = null, port = 0, token = "", tokenBuf = null;
    var cagrilar = [];          // son bir dakikadaki çağrı zamanları
    var calisan = false;        // aynı anda tek eylem
    var kuyruk = [];            // bekleyen eylemler: function()
    var bostaSaat = null;
    var acik = false;

    function yeniToken() {
      token = crypto.randomBytes(32).toString("hex");
      tokenBuf = Buffer.from(token, "utf8");
    }

    function tokenDogru(baslik) {
      var m = /^Bearer ([0-9a-f]{1,128})$/.exec(String(baslik || ""));
      var gelen = Buffer.from(m ? m[1] : "", "utf8");
      if (!tokenBuf || gelen.length !== tokenBuf.length) {
        // eşit olmayan uzunlukta da sabit iş: kendi kendine karşılaştır
        try { crypto.timingSafeEqual(tokenBuf || gelen, tokenBuf || gelen); } catch (e) {}
        return false;
      }
      return crypto.timingSafeEqual(gelen, tokenBuf);
    }

    /* ---------------- Bağlantı dosyası ---------------- */

    function dosyaYaz() {
      if (!dosya) return;
      var icerik = JSON.stringify({ v: 1, port: port, token: token, pid: process.pid, baslangic: new Date(saat()).toISOString() });
      var tmp = dosya + ".tmp-" + process.pid + "-" + crypto.randomBytes(4).toString("hex");
      try { fs.mkdirSync(path.dirname(dosya), { recursive: true }); } catch (e) {}
      fs.writeFileSync(tmp, icerik, { encoding: "utf8", mode: 384 });   // 0o600
      try { fs.chmodSync(tmp, 384); } catch (e2) {}
      try { fs.renameSync(tmp, dosya); }
      catch (e3) {
        // Windows'ta hedef varken rename başarısız olabilir: önce sil, yeniden dene
        try { fs.unlinkSync(dosya); } catch (e4) {}
        fs.renameSync(tmp, dosya);
      }
      try { fs.chmodSync(dosya, 384); } catch (e5) {}
    }

    function dosyaSil() {
      if (!dosya) return;
      try { fs.unlinkSync(dosya); } catch (e) {}
    }

    /* ---------------- Yanıt ---------------- */

    function yanit(res, kod, govde) {
      if (res.headersSent) return;
      var metin = JSON.stringify(govde);
      res.writeHead(kod, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(metin, "utf8"),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Connection": "close"
      });
      res.end(metin);
    }
    function red(res, kod, hata, mesaj) { yanit(res, kod, { ok: false, hata: hata, mesaj: mesaj }); }

    /* ---------------- Bekleme / boşta kapanma ---------------- */

    function bostaKur() {
      if (bostaSaat) clearTimeout(bostaSaat);
      if (!acik || !(bostaKapanma > 0)) return;
      bostaSaat = setTimeout(function () { durdur("bosta"); }, bostaKapanma);
      if (bostaSaat && bostaSaat.unref) bostaSaat.unref();
    }

    function hizAsildi() {
      var simdi = saat();
      while (cagrilar.length && simdi - cagrilar[0] >= 60000) cagrilar.shift();
      if (cagrilar.length >= dakikaSiniri) return true;
      cagrilar.push(simdi);
      return false;
    }

    /* ---------------- Kuyruk: aynı anda tek host eylemi ---------------- */

    function sirayaKoy(is) {
      return new Promise(function (resolve, reject) {
        if (calisan && kuyruk.length >= kuyrukSiniri) { reject({ kod: 429, hata: "kuyruk_dolu", mesaj: "Suflo is busy: too many queued actions." }); return; }
        kuyruk.push(function () {
          calisan = true;
          var p;
          try { p = Promise.resolve(is()); } catch (e) { p = Promise.reject(e); }
          p.then(function (v) { bitir(); resolve(v); }, function (e) { bitir(); reject(e); });
        });
        if (!calisan) sonraki();
      });
    }
    function bitir() { calisan = false; sonraki(); }
    function sonraki() {
      if (calisan || !kuyruk.length) return;
      var f = kuyruk.shift();
      f();
    }

    // K.hostMesgul(): Premiere başka bir ExtendScript işini bitirene kadar bekle
    function mesgulBitsin() {
      return new Promise(function (resolve, reject) {
        var bas = saat();
        (function bak() {
          var m = false;
          try { m = !!mesgulMu(); } catch (e) { m = false; }
          if (!m) { resolve(); return; }
          if (saat() - bas > mesgulBekleme) { reject({ kod: 503, hata: "premiere_mesgul", mesaj: "Premiere is busy with another Suflo task. Try again later." }); return; }
          setTimeout(bak, 200);
        })();
      });
    }

    function onayBekle(e, args) {
      return new Promise(function (resolve) {
        var bitti = false;
        var t = setTimeout(function () { if (!bitti) { bitti = true; resolve(false); } }, onaySuresi);
        var p;
        try { p = Promise.resolve(onayIste(e.ad, args, O.ozet(e.ad, args), onaySuresi)); } catch (er) { p = Promise.resolve(false); }
        p.then(function (v) { if (!bitti) { bitti = true; clearTimeout(t); resolve(v === true); } },
          function () { if (!bitti) { bitti = true; clearTimeout(t); resolve(false); } });
      });
    }

    /* ---------------- Eylem ---------------- */

    function eylemCalistir(res, govde, bas) {
      var ad = govde && typeof govde.ad === "string" ? govde.ad : "";
      var d = O.dogrula(ad, govde ? govde.args : undefined);
      function logla(sonuc, kod) {
        var g = { zaman: saat(), ad: ad || "?", sonuc: sonuc, kod: kod || "", sure: saat() - bas };
        try { kayit(g); } catch (e) {}
        try { log("[mcp] " + g.ad + " " + sonuc + (kod ? " " + kod : "") + " " + g.sure + "ms"); } catch (e2) {}
      }
      if (!d.ok) { logla("hata", d.hata); red(res, d.hata === "bilinmeyen_eylem" ? 404 : 400, d.hata, d.mesaj); return; }
      var e = d.eylem;
      var iz = {};
      try { iz = izinler() || {}; } catch (er) { iz = {}; }
      if (e.sinif !== "oku" && iz.duzenleme !== true) {
        logla("hata", "izin_yok");
        red(res, 403, "izin_yok", "Editing is not allowed: turn on 'Düzenlemeye izin ver' (Allow editing) in Suflo > Settings > AI bridge.");
        return;
      }
      var deneme = false;
      if (e.pro) {
        var p = { ok: false };
        try { p = proIzin(e.pro) || { ok: false }; } catch (er2) { p = { ok: false }; }
        if (!p.ok) {
          logla("hata", "pro_gerekli");
          red(res, 402, "pro_gerekli", "This action needs Suflo Pro (no free trial credits left for '" + e.pro + "').");
          return;
        }
        deneme = p.deneme === true;
      }
      var onayGerek = e.sinif === "yikici" && iz.onay !== false;
      var adim = onayGerek ? onayBekle(e, d.args) : Promise.resolve(true);
      adim.then(function (onay) {
        if (!onay) { logla("hata", "reddedildi"); red(res, 403, "reddedildi", "The user did not confirm this destructive action in Suflo (denied or timed out)."); return; }
        return sirayaKoy(function () {
          // okuma eylemleri Premiere'i değiştirmez: yalnız sıraya girer; yazanlar ayrıca süren işin bitmesini bekler
          var once = e.sinif === "oku" ? Promise.resolve() : mesgulBitsin();
          return once.then(function () { return yurut(e.ad, d.args, { deneme: deneme }); });
        }).then(function (sonuc) {
          var t = O.temizle(sonuc, e.ad === "suflo_altyazi_oku" ? { diziSiniri: O.ALTYAZI_SINIRI } : null);
          if (t && typeof t === "object" && t.ok === false) {
            logla("hata", t.hata || "eylem_hatasi");
            yanit(res, 200, { ok: false, hata: t.hata || "eylem_hatasi", mesaj: String(t.mesaj || t.error || "Action failed.") });
            return;
          }
          logla("ok");
          yanit(res, 200, { ok: true, sonuc: t });
        });
      }).catch(function (er3) {
        var kod = er3 && er3.kod ? er3.kod : 500;
        var h = er3 && er3.hata ? er3.hata : "eylem_hatasi";
        logla("hata", h);
        red(res, kod, h, er3 && er3.mesaj ? er3.mesaj : String((er3 && er3.message) || "Action failed.").slice(0, 300));
      });
    }

    function tarayiciMi(h) {
      if (h.origin !== undefined || h.referer !== undefined || h.upgrade !== undefined) return true;
      for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k) && /^sec-fetch-/i.test(k)) return true;
      return false;
    }

    function istek(req, res) {
      var bas = saat();
      var h = req.headers || {};
      // 1) DNS rebinding: Host tam olarak 127.0.0.1:<port>
      if (h.host !== "127.0.0.1:" + port) { red(res, 403, "yasak", "Forbidden host."); req.resume(); return; }
      // 2) Tarayıcıdan gelen her şey reddedilir (CORS başlığı hiç yok)
      if (tarayiciMi(h)) { red(res, 403, "yasak", "Browser requests are not allowed."); req.resume(); return; }
      if (req.method === "OPTIONS") { red(res, 403, "yasak", "Forbidden."); req.resume(); return; }
      if (req.method !== "POST") { red(res, 405, "yontem", "Only POST " + YOL + "."); req.resume(); return; }
      if (String(req.url || "").split("?")[0] !== YOL || String(req.url).indexOf("?") !== -1) { red(res, 404, "yol", "Not found."); req.resume(); return; }
      if (hizAsildi()) { red(res, 429, "hiz_siniri", "Too many calls: at most " + dakikaSiniri + " per minute."); req.resume(); return; }
      if (!/^application\/json(\s*;\s*charset=utf-8)?$/i.test(String(h["content-type"] || "").trim())) { red(res, 415, "icerik_turu", "Content-Type must be application/json."); req.resume(); return; }
      if (!tokenDogru(h.authorization)) { red(res, 401, "jeton", "Missing or wrong token."); req.resume(); return; }
      var uzunluk = Number(h["content-length"]);
      if (isFinite(uzunluk) && uzunluk > govdeSiniri) { red(res, 413, "buyuk", "Body too large."); req.resume(); return; }

      bostaKur();
      var parcalar = [], boy = 0, bitti = false;
      var okumaSaati = setTimeout(function () {
        if (bitti) return;
        bitti = true;
        red(res, 408, "zaman_asimi", "Request timed out.");
        try { req.destroy(); } catch (e) {}
      }, okumaSuresi);
      req.on("data", function (c) {
        if (bitti) return;
        boy += c.length;
        if (boy > govdeSiniri) {
          bitti = true;
          clearTimeout(okumaSaati);
          red(res, 413, "buyuk", "Body too large.");
          req.pause();
          return;
        }
        parcalar.push(c);
      });
      req.on("error", function () { bitti = true; clearTimeout(okumaSaati); });
      req.on("end", function () {
        if (bitti) return;
        bitti = true;
        clearTimeout(okumaSaati);
        var govde;
        try { govde = JSON.parse(Buffer.concat(parcalar).toString("utf8")); }
        catch (e) { red(res, 400, "json", "Invalid JSON."); return; }
        if (!govde || typeof govde !== "object" || Array.isArray(govde)) { red(res, 400, "json", "Invalid body."); return; }
        eylemCalistir(res, govde, bas);
      });
    }

    /* ---------------- Aç / kapat ---------------- */

    function baslat() {
      return new Promise(function (resolve, reject) {
        if (acik) { resolve({ port: port }); return; }
        yeniToken();
        cagrilar = [];
        sunucu = http.createServer(istek);
        // eylemler (kopyada kesim) uzun sürebilir: yanıt beklerken soket kapanmasın; gövde
        // okuma süresi istek başına 30 sn ile ayrıca sınırlı
        try { sunucu.timeout = 0; sunucu.keepAliveTimeout = 1000; sunucu.headersTimeout = okumaSuresi; } catch (e) {}
        sunucu.on("error", function (err) { if (!acik) reject(err); else log("[mcp] sunucu hatasi: " + (err && err.message)); });
        sunucu.listen(0, "127.0.0.1", function () {
          var a = sunucu.address();
          port = a && a.port;
          if (!a || a.address !== "127.0.0.1") { try { sunucu.close(); } catch (e2) {} reject(new Error("loopback disi adres")); return; }
          acik = true;
          try { dosyaYaz(); }
          catch (e3) { durdur("dosya"); reject(e3); return; }
          bostaKur();
          log("[mcp] kopru acildi (127.0.0.1)");
          resolve({ port: port });
        });
      });
    }

    function durdur(neden) {
      var oncedenAcik = acik;
      acik = false;
      if (bostaSaat) { clearTimeout(bostaSaat); bostaSaat = null; }
      dosyaSil();
      token = ""; tokenBuf = null;
      if (sunucu) { try { sunucu.close(); } catch (e) {} sunucu = null; }
      kuyruk = [];
      if (oncedenAcik) {
        log("[mcp] kopru kapandi (" + (neden || "kapat") + ")");
        try { onKapandi(neden || "kapat"); } catch (e2) {}
      }
    }

    // "Yeni jeton": dosya yeniden yazılır, eski jeton anında geçersiz
    function jetonYenile() {
      if (!acik) return false;
      yeniToken();
      dosyaYaz();
      return true;
    }

    return {
      baslat: baslat,
      durdur: durdur,
      jetonYenile: jetonYenile,
      acikMi: function () { return acik; },
      port: function () { return port; },
      _token: function () { return token; }
    };
  }

  return {
    olustur: olustur, YOL: YOL, GOVDE_SINIRI: GOVDE_SINIRI, DAKIKA_SINIRI: DAKIKA_SINIRI,
    KUYRUK_SINIRI: KUYRUK_SINIRI, ONAY_SURESI: ONAY_SURESI, BOSTA_KAPANMA: BOSTA_KAPANMA
  };
});
