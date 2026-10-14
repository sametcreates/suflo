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
 *  - gövde en çok 256 KB, 30 sn okuma süresi; jetonu doğru isteklerde dakikada en çok 120 çağrı;
 *    aynı anda tek eylem, kuyrukta en çok 4
 *  - yalnız js/otomasyon.js listesindeki eylemler; yaz/yıkıcı eylemler "Düzenlemeye izin ver"
 *    ister, yıkıcılar ayrıca panelde onay kartı (60 sn'de yanıt yoksa reddedilir; aynı anda tek
 *    kart, ikinci yıkıcı istek 409 onay_bekliyor)
 *  - kapatma anahtarı: köprü kapanınca kuyruktaki, meşgul beklemesindeki ve onay bekleyen hiçbir
 *    istek yürütülmez (503 kopru_kapali); izin / Pro yürütmeden hemen önce yeniden denetlenir
 *  - hata metinleri de temizlenir (mutlak yol → dosya adı); reddedilen istekler de günlüğe yazılır
 *  - 30 dakika çağrı gelmezse kendiliğinden kapanır; deneme oturumu ayrıca mutlak süre sınırıyla
 *    (baslat({ sure })) kapanır, çağrılar bu sınırı uzatmaz
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
    var cagrilar = [];          // son bir dakikadaki çağrı zamanları (yalnız jetonu doğru istekler)
    var calisan = false;        // aynı anda tek eylem
    var kuyruk = [];            // bekleyen eylemler: { calistir: function(), reddet: function(hata) }
    var bostaSaat = null;
    var sureSaat = null;        // oturumun mutlak süre sınırı (deneme oturumu): çağrılar uzatmaz
    var acik = false;
    // Oturum kuşağı: her açılış ve kapanışta artar. Kabul edilmiş bir istek kuyrukta, meşgul
    // beklemesinde ya da onay kartında beklerken köprü kapatılırsa (ya da kapatılıp yeniden
    // açılırsa) yürütülmez: 503 kopru_kapali
    var nesil = 0;
    var onaySahibi = null;      // panelde bekleyen yıkıcı eylem onayı (aynı anda tek kart)
    var redSayac = { bas: 0, adet: 0, gizli: 0 };

    function kapaliHata() { return { kod: 503, hata: "kopru_kapali", mesaj: "The Suflo AI bridge was turned off in the panel; the action was not run." }; }

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

    // İstemciye giden her hata metni de temizlenir: Node fs hataları ("EACCES … '/Users/…/x.srt'")
    // mutlak yol taşır; yanıtta yalnız dosya adı kalır
    function temizMesaj(m) {
      var t = "";
      try { t = O.temizle(String(m === undefined || m === null ? "" : m)); } catch (e) { t = ""; }
      return String(t || "Action failed.").slice(0, 300);
    }

    /*
     * Eyleme ulaşmadan reddedilen istekler (Host, tarayıcı, yöntem, yol, jeton, hız, içerik türü,
     * boyut, JSON) de etkinlik listesine ve K.log'a yazılır. Dakikada en çok RED_KAYIT_SINIRI satır:
     * bir istek seli son 50 gerçek çağrıyı listeden itmesin; fazlası dakika sonunda tek satırla sayılır.
     */
    var RED_KAYIT_SINIRI = 10;
    function redKaydet(kod, bas) {
      var simdi = saat();
      if (simdi - redSayac.bas >= 60000) {
        if (redSayac.gizli) { try { log("[mcp] " + redSayac.gizli + " reddedilen istek daha (listeye yazilmadi)"); } catch (e0) {} }
        redSayac = { bas: simdi, adet: 0, gizli: 0 };
      }
      if (redSayac.adet >= RED_KAYIT_SINIRI) { redSayac.gizli++; return; }
      redSayac.adet++;
      var g = { zaman: simdi, ad: "_istek", sonuc: "hata", kod: kod, sure: simdi - bas };
      try { kayit(g); } catch (e) {}
      try { log("[mcp] reddedilen istek " + kod + " " + g.sure + "ms"); } catch (e2) {}
    }

    /* ---------------- Bekleme / boşta kapanma ---------------- */

    function bostaKur() {
      if (bostaSaat) clearTimeout(bostaSaat);
      if (!acik || !(bostaKapanma > 0)) return;
      bostaSaat = setTimeout(function () { durdur("bosta"); }, bostaKapanma);
      if (bostaSaat && bostaSaat.unref) bostaSaat.unref();
    }

    // Mutlak süre sınırı: boşta sayacından farklı olarak çağrılar onu UZATMAZ (deneme oturumu en çok
    // bu kadar açık kalır). ms <= 0 ya da sayı değilse sınır kaldırılır (ör. oturum sırasında Pro alındı).
    function sureSiniri(ms) {
      if (sureSaat) { clearTimeout(sureSaat); sureSaat = null; }
      if (!acik || typeof ms !== "number" || !(ms > 0)) return;
      sureSaat = setTimeout(function () { durdur("sure"); }, ms);
      if (sureSaat && sureSaat.unref) sureSaat.unref();
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
        kuyruk.push({
          calistir: function () {
            calisan = true;
            var p;
            try { p = Promise.resolve(is()); } catch (e) { p = Promise.reject(e); }
            p.then(function (v) { bitir(); resolve(v); }, function (e) { bitir(); reject(e); });
          },
          // durdur(): kuyrukta bekleyen her istek yanıtsız kalmasın (soket açık kalır, shim 20 dk bekler)
          reddet: reject
        });
        if (!calisan) sonraki();
      });
    }
    function bitir() { calisan = false; sonraki(); }
    function sonraki() {
      if (calisan || !kuyruk.length) return;
      var f = kuyruk.shift();
      f.calistir();
    }

    // K.hostMesgul(): Premiere başka bir ExtendScript işini bitirene kadar bekle; köprü bu sırada
    // kapatılırsa beklemeyi hemen bırak (eylem yürütülmez)
    function mesgulBitsin(gecerli) {
      return new Promise(function (resolve, reject) {
        var bas = saat();
        (function bak() {
          if (gecerli && !gecerli()) { reject(kapaliHata()); return; }
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

    var IZIN_YOK_MESAJ = "Editing is not allowed: turn on 'Düzenlemeye izin ver' (Allow editing) in Suflo > Settings > AI bridge.";
    function proYokHata(f) { return { kod: 402, hata: "pro_gerekli", mesaj: "This action needs Suflo Pro (no free trial credits left for '" + f + "')." }; }
    function proDurumu(f) {
      var p = { ok: false };
      try { p = proIzin(f) || { ok: false }; } catch (e) { p = { ok: false }; }
      return p;
    }
    function duzenlemeAcik() {
      var iz = {};
      try { iz = izinler() || {}; } catch (e) { iz = {}; }
      return iz.duzenleme === true;
    }

    function eylemCalistir(res, govde, bas, benimNesil) {
      var ad = govde && typeof govde.ad === "string" ? govde.ad : "";
      var d = O.dogrula(ad, govde ? govde.args : undefined);
      function logla(sonuc, kod) {
        var g = { zaman: saat(), ad: ad || "?", sonuc: sonuc, kod: kod || "", sure: saat() - bas };
        try { kayit(g); } catch (e) {}
        try { log("[mcp] " + g.ad + " " + sonuc + (kod ? " " + kod : "") + " " + g.sure + "ms"); } catch (e2) {}
      }
      // Bu isteğin kabul edildiği oturum hâlâ açık mı (kapat / 30 dk boşta / panel yeniden yüklendi)
      function gecerli() { return acik && nesil === benimNesil; }
      if (!gecerli()) { logla("hata", "kopru_kapali"); var kh = kapaliHata(); red(res, kh.kod, kh.hata, kh.mesaj); return; }
      if (!d.ok) { logla("hata", d.hata); red(res, d.hata === "bilinmeyen_eylem" ? 404 : 400, d.hata, temizMesaj(d.mesaj)); return; }
      var e = d.eylem;
      var iz = {};
      try { iz = izinler() || {}; } catch (er) { iz = {}; }
      if (e.sinif !== "oku" && iz.duzenleme !== true) {
        logla("hata", "izin_yok");
        red(res, 403, "izin_yok", IZIN_YOK_MESAJ);
        return;
      }
      if (e.pro && !proDurumu(e.pro).ok) {
        logla("hata", "pro_gerekli");
        var ph = proYokHata(e.pro);
        red(res, ph.kod, ph.hata, ph.mesaj);
        return;
      }
      var onayGerek = e.sinif === "yikici" && iz.onay !== false;
      // Panelde aynı anda tek onay kartı: bekleyen kart başka bir eylemle DEĞİŞTİRİLMEZ (kullanıcının
      // A için bastığı Onayla B'yi onaylamasın), yeni yıkıcı istek hemen 409 alır
      if (onayGerek && onaySahibi) {
        logla("hata", "onay_bekliyor");
        red(res, 409, "onay_bekliyor", "Another destructive action is already waiting for the user's confirmation in Suflo. Wait for that answer, then call again.");
        return;
      }
      var adim = Promise.resolve(true);
      if (onayGerek) {
        var benimOnay = {};
        onaySahibi = benimOnay;
        adim = onayBekle(e, d.args).then(function (v) { if (onaySahibi === benimOnay) onaySahibi = null; return v; });
      }
      adim.then(function (onay) {
        if (!gecerli()) throw kapaliHata();
        if (!onay) { logla("hata", "reddedildi"); red(res, 403, "reddedildi", "The user did not confirm this destructive action in Suflo (denied or timed out)."); return; }
        return sirayaKoy(function () {
          if (!gecerli()) return Promise.reject(kapaliHata());
          // okuma eylemleri Premiere'i değiştirmez: yalnız sıraya girer; yazanlar ayrıca süren işin bitmesini bekler
          var once = e.sinif === "oku" ? Promise.resolve() : mesgulBitsin(gecerli);
          return once.then(function () {
            // Kuyrukta / meşgul beklemesinde geçen sürede kullanıcı köprüyü kapatmış, "Düzenlemeye izin
            // ver"i kapatmış ya da Pro / deneme hakkı bitmiş olabilir: yürütmeden hemen önce yeniden bak
            if (!gecerli()) throw kapaliHata();
            if (e.sinif !== "oku" && !duzenlemeAcik()) throw { kod: 403, hata: "izin_yok", mesaj: IZIN_YOK_MESAJ };
            var deneme = false;
            if (e.pro) {
              var p = proDurumu(e.pro);
              if (!p.ok) throw proYokHata(e.pro);
              deneme = p.deneme === true;
            }
            return yurut(e.ad, d.args, { deneme: deneme });
          });
        }).then(function (sonuc) {
          var t = O.temizle(sonuc, e.ad === "suflo_altyazi_oku" ? { diziSiniri: O.ALTYAZI_SINIRI } : null);
          if (t && typeof t === "object" && t.ok === false) {
            logla("hata", t.hata || "eylem_hatasi");
            yanit(res, 200, { ok: false, hata: t.hata || "eylem_hatasi", mesaj: temizMesaj(t.mesaj || t.error || "Action failed.") });
            return;
          }
          logla("ok");
          yanit(res, 200, { ok: true, sonuc: t });
        });
      }).catch(function (er3) {
        var kod = er3 && er3.kod ? er3.kod : 500;
        var h = er3 && er3.hata ? String(er3.hata).slice(0, 40) : "eylem_hatasi";
        var m = er3 && er3.mesaj ? er3.mesaj : ((er3 && er3.message) || (typeof er3 === "string" ? er3 : "Action failed."));
        logla("hata", h);
        red(res, kod, h, temizMesaj(m));
      });
    }

    function tarayiciMi(h) {
      if (h.origin !== undefined || h.referer !== undefined || h.upgrade !== undefined) return true;
      for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k) && /^sec-fetch-/i.test(k)) return true;
      return false;
    }

    function istek(req, res) {
      var bas = saat();
      var benimNesil = nesil;
      var h = req.headers || {};
      function ret(kod, hata, mesaj, okuma) {
        red(res, kod, hata, mesaj);
        if (okuma !== false) req.resume();
        redKaydet(hata, bas);
      }
      // 1) DNS rebinding: Host tam olarak 127.0.0.1:<port>
      if (h.host !== "127.0.0.1:" + port) { ret(403, "yasak", "Forbidden host."); return; }
      // 2) Tarayıcıdan gelen her şey reddedilir (CORS başlığı hiç yok)
      if (tarayiciMi(h)) { ret(403, "yasak", "Browser requests are not allowed."); return; }
      if (req.method === "OPTIONS") { ret(403, "yasak", "Forbidden."); return; }
      if (req.method !== "POST") { ret(405, "yontem", "Only POST " + YOL + "."); return; }
      if (String(req.url || "").split("?")[0] !== YOL || String(req.url).indexOf("?") !== -1) { ret(404, "yol", "Not found."); return; }
      // kapatılmış oturumun açık kalmış soketi
      if (!acik) { var kh = kapaliHata(); ret(kh.kod, kh.hata, kh.mesaj); return; }
      if (!/^application\/json(\s*;\s*charset=utf-8)?$/i.test(String(h["content-type"] || "").trim())) { ret(415, "icerik_turu", "Content-Type must be application/json."); return; }
      if (!tokenDogru(h.authorization)) { ret(401, "jeton", "Missing or wrong token."); return; }
      // Hız sınırı jetondan SONRA: jetonsuz istekler gerçek istemcinin dakikalık hakkını tüketemez
      if (hizAsildi()) { ret(429, "hiz_siniri", "Too many calls: at most " + dakikaSiniri + " per minute."); return; }
      var uzunluk = Number(h["content-length"]);
      if (isFinite(uzunluk) && uzunluk > govdeSiniri) { ret(413, "buyuk", "Body too large."); return; }

      bostaKur();
      var parcalar = [], boy = 0, bitti = false;
      var okumaSaati = setTimeout(function () {
        if (bitti) return;
        bitti = true;
        ret(408, "zaman_asimi", "Request timed out.", false);
        try { req.destroy(); } catch (e) {}
      }, okumaSuresi);
      req.on("data", function (c) {
        if (bitti) return;
        boy += c.length;
        if (boy > govdeSiniri) {
          bitti = true;
          clearTimeout(okumaSaati);
          ret(413, "buyuk", "Body too large.", false);
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
        catch (e) { ret(400, "json", "Invalid JSON.", false); return; }
        if (!govde || typeof govde !== "object" || Array.isArray(govde)) { ret(400, "json", "Invalid body.", false); return; }
        // gövde okunurken köprü kapatıldıysa eylemCalistir 503 kopru_kapali döner
        eylemCalistir(res, govde, bas, benimNesil);
      });
    }

    /* ---------------- Aç / kapat ---------------- */

    // o.sure (ms): oturumun mutlak süre sınırı (deneme oturumu); verilmezse yalnız boşta kapanma
    function baslat(o) {
      o = o || {};
      return new Promise(function (resolve, reject) {
        if (acik) { resolve({ port: port }); return; }
        yeniToken();
        cagrilar = [];
        nesil++;
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
          sureSiniri(o.sure);
          log("[mcp] kopru acildi (127.0.0.1)" + (o.sure > 0 ? " sure siniri " + Math.round(o.sure / 60000) + " dk" : ""));
          resolve({ port: port });
        });
      });
    }

    function durdur(neden) {
      var oncedenAcik = acik;
      acik = false;
      if (bostaSaat) { clearTimeout(bostaSaat); bostaSaat = null; }
      if (sureSaat) { clearTimeout(sureSaat); sureSaat = null; }
      dosyaSil();
      token = ""; tokenBuf = null;
      if (sunucu) { try { sunucu.close(); } catch (e) {} sunucu = null; }
      // Kabul edilmiş ama henüz yürütülmemiş işler: hiçbiri artık yürütülmez (kuşak değişti) ve
      // kuyrukta bekleyenler hemen 503 kopru_kapali yanıtı alır. Süren tek eylem Premiere'de yarıda
      // kesilemez; o bitince kendi yanıtını alır.
      nesil++;
      onaySahibi = null;
      var bekleyen = kuyruk;
      kuyruk = [];
      bekleyen.forEach(function (k) { try { k.reddet(kapaliHata()); } catch (e1) {} });
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
      sureSiniri: sureSiniri,
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
