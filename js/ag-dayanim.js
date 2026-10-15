/*
 * Suflo — kurumsal ağ dayanıklılığı (saf, DOM'suz, durumsuz modül; 3.4 adım 19)
 *
 * Şirket / okul ağlarında model ve motor indirmesini bozan üç durumu tanır ve anlatır:
 *
 *   1. HTTPS denetimi (TLS inspection): güvenlik yazılımı bağlantıyı kendi kök sertifikasıyla
 *      yeniden imzalar; Node'un yerleşik kök listesi bu kökü tanımaz ve istek
 *      UNABLE_TO_GET_ISSUER_CERT_LOCALLY / SELF_SIGNED_CERT_IN_CHAIN / CERT_UNTRUSTED /
 *      UNABLE_TO_VERIFY_LEAF_SIGNATURE ile düşer. Köprü (js/bridge.js) bu hatada isteği BİR KEZ,
 *      ca = tls.rootCertificates + işletim sisteminin sertifika deposundaki ek kökler ile yeniden dener.
 *      Sertifika doğrulaması ASLA kapatılmaz: sertifika yine doğrulanır, yalnız aşağıdaki depoların
 *      kökleri de hesaba katılır. Not (3.4 inceleme): macOS'ta bu, işletim sisteminin SSL için güvendiği
 *      kümeden geniştir: System.keychain'deki her sertifika alınır, yalnız açık "Asla Güvenme" atılır;
 *      güven ayarı olmayan ("Sistem Varsayılanlarını Kullan") ya da yalnız başka bir amaca (S/MIME, kod
 *      imzası) güvenilen sertifikalar da girer. O depoya sertifika koymak yönetici yetkisi ister.
 *        Windows: CurrentUser\Root ve LocalMachine\Root depoları, SABİT bir PowerShell betiğiyle
 *                 (execFile/spawn, argüman dizisi; betiğe hiçbir girdi eklenmez). Disallowed depolarındaki ve
 *                 amacı Sunucu Kimlik Doğrulamasını dışlayan kökler alınmaz.
 *        macOS:   security find-certificate -a -p /Library/Keychains/System.keychain; yönetici ya da
 *                 kullanıcı güven ayarında "Asla Güvenme" (Deny) olanlar atılır.
 *   2. DNS filtresi: ad 146.112.0.0/16'ya (Cisco Umbrella engel sayfası) ya da 0.0.0.0'a
 *      çözülüyorsa "kurumsal filtre engelliyor" denir.
 *   3. Doctor "Model kaynaklarını sına": huggingface.co, hf-mirror.com ve motor sürüm sunucusuna
 *      5 sn zaman aşımlı HEAD isteği; satırlar kaynakSatirlari() ile kurulur.
 *
 * Fikir: Raunen (MIT) — windowsCaBundle / describeNetworkError / kaynak sınama düğmesi. Kod
 * Suflo'nun kendi (temiz oda), taşınmadı. Raunen'in serbest "özel ayna" ayarı ALINMADI: özet
 * doğrulamasını atlatır.
 * Çalışma ortamı: CEF 74 / Node 12.3 (ES5).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloAgDayanim = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  /* ---------------- Sertifika hataları ---------------- */

  // Node / OpenSSL kodu -> İngilizce ileti (köprü hatayı çoğu yerde String(e) olarak taşır, kod düşer)
  var SERTIFIKA_HATALARI = {
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "unable to get local issuer certificate",
    SELF_SIGNED_CERT_IN_CHAIN: "self signed certificate in certificate chain",
    CERT_UNTRUSTED: "certificate not trusted",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "unable to verify the first certificate"
  };

  function hataMetni(e) {
    if (e === null || e === undefined) return "";
    if (typeof e === "string") return e;
    var kod = e.code ? String(e.code) : "";
    var msg = e.message ? String(e.message) : String(e);
    return kod && msg.indexOf(kod) === -1 ? kod + " " + msg : msg;
  }

  function hataKodu(e) {
    return e && typeof e === "object" && e.code ? String(e.code) : "";
  }

  // Metinde kod ya da ileti var mı? OpenSSL 3 (Node 17+) "self-signed" yazar, OpenSSL 1.1 "self signed":
  // tire boşluk sayılır (3.4 adım 19 inceleme 2)
  function koduBul(m) {
    var kucuk = String(m || "").toLowerCase().replace(/-/g, " ");
    for (var k in SERTIFIKA_HATALARI) {
      if (!SERTIFIKA_HATALARI.hasOwnProperty(k)) continue;
      if (m.indexOf(k) !== -1 || kucuk.indexOf(SERTIFIKA_HATALARI[k]) !== -1) return k;
    }
    return "";
  }

  // Yeniden denemeyi hak eden sertifika hatası mı? (süresi dolmuş / ad uyuşmazlığı DEĞİL: onlar ağ sorunu değildir)
  function sertifikaHatasiMi(e) {
    var kod = hataKodu(e);
    if (kod && SERTIFIKA_HATALARI.hasOwnProperty(kod)) return true;
    var m = hataMetni(e);
    return !!m && !!koduBul(m);
  }

  /* ---------------- PEM ---------------- */

  var PEM_RE = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;
  var EN_COK_PEM = 3000;

  // Metindeki sertifikaları ayıkla, gövdeyi 64 sütuna yeniden sar, yinelenenleri at
  function pemleriAyikla(metin) {
    var out = [], gorulen = {};
    var s = String(metin || "");
    var m;
    PEM_RE.lastIndex = 0;
    while ((m = PEM_RE.exec(s)) && out.length < EN_COK_PEM) {
      var govde = m[1].replace(/[^A-Za-z0-9+\/=]/g, "");
      if (govde.length < 64 || !/^[A-Za-z0-9+\/]+={0,2}$/.test(govde)) continue;
      if (gorulen[govde]) continue;
      gorulen[govde] = true;
      var satirlar = [];
      for (var i = 0; i < govde.length; i += 64) satirlar.push(govde.slice(i, i + 64));
      out.push("-----BEGIN CERTIFICATE-----\n" + satirlar.join("\n") + "\n-----END CERTIFICATE-----\n");
    }
    return out;
  }

  function pemGovdesi(p) {
    return String(p || "").replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/[^A-Za-z0-9+\/=]/g, "");
  }

  /*
   * Yeniden deneme için ca listesi: yerleşik kökler (Node 12.3+ tls.rootCertificates; tanımsızsa
   * atlanır) + ek PEM'ler. Ek kök yoksa null: aynı köklerle ikinci deneme aynı hatayı verir.
   */
  function caListesi(kokler, ekPemler) {
    var ek = Array.isArray(ekPemler) ? ekPemler : [];
    if (!ek.length) return null;
    var out = Array.isArray(kokler) ? kokler.slice() : [];
    var var_ = {};
    out.forEach(function (p) { var_[pemGovdesi(p)] = true; });
    var eklendi = 0;
    ek.forEach(function (p) {
      var g = pemGovdesi(p);
      if (!g || var_[g]) return;
      var_[g] = true;
      out.push(p);
      eklendi++;
    });
    return eklendi ? out : null;
  }

  /*
   * Windows kök deposu dışa aktarımı. SABİT betik: içine hiçbir kullanıcı / ağ girdisi eklenmez,
   * argüman dizisiyle (kabuk yok) çalıştırılır. Base64 satır kırmasız gelir; pemleriAyikla sarar.
   * Windows'un kendi güvensizliği korunur (3.4 adım 19 inceleme 2). Root'ta dursa da:
   *   - Disallowed (Güvenilmeyen Sertifikalar: GPO "Untrusted Certificates", Microsoft'un güvenmediği kökler)
   *     depolarındaki parmak izleri atlanır,
   *   - amaçları sınırlanmış (EnhancedKeyUsageList boş değil) ve Sunucu Kimlik Doğrulaması (1.3.6.1.5.5.7.3.1)
   *     içermeyen kökler atlanır: Edge / Chrome onlarla HTTPS'e güvenmez.
   * İlk denemeyi düşüren ağdaki saldırgan, Windows'un reddettiği bir kökle ikinci denemeyi geçemez.
   */
  var WIN_BETIK =
    "$ErrorActionPreference='SilentlyContinue';$y=@{};" +
    "foreach($d in @('Cert:\\CurrentUser\\Disallowed','Cert:\\LocalMachine\\Disallowed')){" +
    "Get-ChildItem -Path $d | ForEach-Object {$y[[string]$_.Thumbprint]=1}};" +
    "foreach($d in @('Cert:\\CurrentUser\\Root','Cert:\\LocalMachine\\Root')){" +
    "Get-ChildItem -Path $d | ForEach-Object {$c=$_;$e=@($c.EnhancedKeyUsageList | Where-Object {$_});" +
    "if(-not $y.ContainsKey([string]$c.Thumbprint) -and ($e.Count -eq 0 -or ($e | Where-Object {$_.ObjectId -eq '1.3.6.1.5.5.7.3.1'}))){" +
    "'-----BEGIN CERTIFICATE-----';[Convert]::ToBase64String($c.RawData);'-----END CERTIFICATE-----'" +
    "}}}";

  function winKomutu() {
    return { cmd: "powershell.exe", args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WIN_BETIK] };
  }

  function macKomutu() {
    return { cmd: "/usr/bin/security", args: ["find-certificate", "-a", "-p", "/Library/Keychains/System.keychain"] };
  }

  // platform: process.platform. Linux'ta Node zaten OpenSSL'in sistem deposunu kullanabilir: komut yok.
  function sertifikaKomutu(platform) {
    if (platform === "win32") return winKomutu();
    if (platform === "darwin") return macKomutu();
    return null;
  }

  /*
   * macOS güven ayarları (3.4 adım 19 inceleme 2). find-certificate System.keychain'deki her sertifikayı basar,
   * yöneticinin ya da kullanıcının "Asla Güvenme" dediklerini de: onlar ek köklerden atılır.
   *   guvenAyariKomutu(alan, dosya)  alan "yonetici" (-d) ya da "kullanici". security trust-settings-export
   *                                  ayarları dosyaya yazar (stdout'a değil); ayar yoksa sıfırdan farklı kodla
   *                                  biter: o alanda reddedilen yok demektir.
   *   reddedilenParmakIzleri(plist)  XML plist'te sonucu kSecTrustSettingsResultDeny (3) olan girdilerin SHA-1
   *                                  parmak izleri { "AB12…": true } (trustList anahtarları sertifikanın SHA-1'i).
   *   reddedilenleriAt(p, r, sha1)   sha1(DER'in base64'ü) → onaltılık parmak izi; reddedilenler atılır.
   * Okunamayan / çözülemeyen ayar yerel bir arızadır (ağdaki saldırgan etkileyemez): o alan boş sayılır.
   */
  function guvenAyariKomutu(alan, dosya) {
    var args = ["trust-settings-export"];
    if (alan === "yonetici") args.push("-d");
    args.push(String(dosya));
    return { cmd: "/usr/bin/security", args: args };
  }

  var GUVEN_ANAHTARI = /<key>\s*([0-9A-Fa-f]{40})\s*<\/key>/g;
  var GUVEN_RED = /<key>\s*kSecTrustSettingsResult\s*<\/key>\s*<integer>\s*3\s*<\/integer>/;

  function reddedilenParmakIzleri(plist) {
    var out = {};
    var s = String(plist || "");
    var bas = s.indexOf("trustList");
    if (bas === -1) return out;
    s = s.slice(bas);
    var yerler = [], m;
    GUVEN_ANAHTARI.lastIndex = 0;
    while ((m = GUVEN_ANAHTARI.exec(s))) yerler.push({ iz: m[1].toUpperCase(), bas: m.index + m[0].length });
    for (var i = 0; i < yerler.length; i++) {
      var parca = s.slice(yerler[i].bas, i + 1 < yerler.length ? yerler[i + 1].bas : s.length);
      if (GUVEN_RED.test(parca)) out[yerler[i].iz] = true;
    }
    return out;
  }

  function reddedilenleriAt(pemler, reddedilen, sha1) {
    var liste = Array.isArray(pemler) ? pemler : [];
    if (!reddedilen || typeof sha1 !== "function" || !Object.keys(reddedilen).length) return liste.slice();
    return liste.filter(function (p) {
      var iz = "";
      try { iz = String(sha1(pemGovdesi(p)) || "").toUpperCase(); } catch (e) { iz = ""; }
      return !iz || !reddedilen[iz];
    });
  }

  /* ---------------- DNS filtresi ---------------- */

  function ipv4(adres) {
    var a = String(adres || "").trim().toLowerCase();
    if (a.indexOf("::ffff:") === 0) a = a.slice(7);
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(a) ? a : "";
  }

  // Cisco Umbrella engel sayfası (146.112.0.0/16) ya da "kara delik" 0.0.0.0
  function dnsEngelliMi(adres) {
    var a = ipv4(adres);
    if (!a) return String(adres || "").trim() === "::";
    if (a === "0.0.0.0") return true;
    return a.indexOf("146.112.") === 0;
  }

  // adresler: dns.lookup({ all: true }) çıktısı ya da düz adres dizisi
  function dnsEngelAdresi(adresler) {
    var liste = Array.isArray(adresler) ? adresler : [adresler];
    for (var i = 0; i < liste.length; i++) {
      var x = liste[i] && typeof liste[i] === "object" ? liste[i].address : liste[i];
      if (dnsEngelliMi(x)) return String(x);
    }
    return "";
  }

  // Yalnız teşhis (indirme hatasına eklenir; çözümü K.hataYardimi ekler)
  function dnsEngelTeshis(host, adres) {
    var umbrella = ipv4(adres).indexOf("146.112.") === 0;
    return "Kurumsal ağ filtresi " + (host ? host + " adresini " : "bu adresi ") + "engelliyor" +
      (umbrella ? " (Cisco Umbrella, " + adres + ")." : " (ad " + (adres || "0.0.0.0") + " adresine yönlendiriliyor).");
  }

  var DNS_ENGEL_COZUM = "BT ekibinden izin iste ya da modeli başka bir bilgisayarda indirip Ayarlar › Motor › Model dosyası içe aktar ile kur.";

  function dnsEngelIpucu(host, adres) {
    return dnsEngelTeshis(host, adres) + " " + DNS_ENGEL_COZUM;
  }

  /* ---------------- Hatayı anlat (describeNetworkError fikri) ---------------- */

  var IPUCU_ICE_AKTAR = "Olmazsa modeli başka bir bilgisayarda indirip Ayarlar › Motor › Model dosyası içe aktar ile kurabilirsin.";

  /*
   * ek: { dnsEngelAdresi, host, caDenendi }
   * Döner: { tur, mesaj } — tur: dns-engel | sertifika | dns | zaman | baglanti | vekil | http | bilinmiyor
   */
  function agHatasiAcikla(hata, ek) {
    ek = ek || {};
    var m = hataMetni(hata);
    if (ek.dnsEngelAdresi) return { tur: "dns-engel", mesaj: dnsEngelIpucu(ek.host, ek.dnsEngelAdresi) };
    if (sertifikaHatasiMi(hata)) {
      return {
        tur: "sertifika",
        mesaj: "Ağ HTTPS bağlantılarını denetliyor (kurumsal güvenlik yazılımı, sertifika: " + (hataKodu(hata) || sertifikaKoduBul(m)) + "). " +
          (ek.caDenendi ? "Suflo bilgisayarın güvendiği sertifikalarla bir kez daha denedi, olmadı. " : "") +
          "BT ekibinden " + (ek.host || "bu adres") + " için izin iste. " + IPUCU_ICE_AKTAR
      };
    }
    if (/Proxy CONNECT reddetti: HTTP 407|\b407\b.*[Pp]roxy/.test(m)) {
      return { tur: "vekil", mesaj: "Vekil sunucu kimlik doğrulaması istiyor (HTTP 407). Ayarlar'daki vekil adresine kullanıcı:parola ekle." };
    }
    if (/Proxy CONNECT/.test(m)) {
      return { tur: "vekil", mesaj: "Vekil sunucu bağlantıyı kurmadı (" + m.replace(/^Error:\s*/, "") + "). Ayarlar'daki vekil adresini kontrol et." };
    }
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) {
      return { tur: "dns", mesaj: (ek.host || "Sunucu") + " adı çözülemedi: internet yok ya da ağ bu adı engelliyor. " + IPUCU_ICE_AKTAR };
    }
    if (/ETIMEDOUT|zaman aşımı|timed? ?out/i.test(m)) {
      return { tur: "zaman", mesaj: (ek.host || "Sunucu") + " yanıt vermedi (zaman aşımı): güvenlik duvarı bağlantıyı düşürüyor olabilir. " + IPUCU_ICE_AKTAR };
    }
    if (/ECONNREFUSED|ECONNRESET|socket hang up|EHOSTUNREACH|ENETUNREACH/i.test(m)) {
      return { tur: "baglanti", mesaj: (ek.host || "Sunucu") + " bağlantıyı reddetti ya da kesti: ağ filtresi engelliyor olabilir. " + IPUCU_ICE_AKTAR };
    }
    var http = /HTTP (\d{3})/.exec(m);
    if (http) {
      var kod = Number(http[1]);
      if (kod === 403 || kod === 451) {
        return { tur: "http", mesaj: (ek.host || "Sunucu") + " erişimi reddetti (HTTP " + kod + "): kurumsal filtre engelliyor olabilir. " + IPUCU_ICE_AKTAR };
      }
      return { tur: "http", mesaj: (ek.host || "Sunucu") + " HTTP " + kod + " döndü." };
    }
    return { tur: "bilinmiyor", mesaj: m.replace(/^Error:\s*/, "") };
  }

  function sertifikaKoduBul(m) { return koduBul(m) || "?"; }

  /* ---------------- Doctor: model kaynaklarını sına ---------------- */

  var SINAMA_ZAMAN_ASIMI = 5000;
  var YENIDEN_SINA = "Bilgisayarın güvendiği sertifikalarla yeniden deneme süreye sığmadı: birkaç saniye sonra yeniden sına.";

  // motorUrl: motorun sürüm arşivi (KEngine.motorKaynakAdresi()); ana makinesi sınanır
  function kaynakAdresleri(motorUrl) {
    var motorHost = "github.com";
    try { motorHost = /^https:\/\/([^\/:?#]+)/i.exec(String(motorUrl || ""))[1].toLowerCase(); } catch (e) {}
    return [
      { id: "hf", ad: "Hugging Face (modeller)", host: "huggingface.co", url: "https://huggingface.co/" },
      { id: "ayna", ad: "Model aynası", host: "hf-mirror.com", url: "https://hf-mirror.com/" },
      { id: "motor", ad: "Motor sürümleri", host: motorHost, url: "https://" + motorHost + "/" }
    ];
  }

  /*
   * sonuclar: [{ id, ad, host, status, hata, sure, dnsEngelAdresi, caDenendi, caSuresiDoldu }]
   *   hata: metin ya da { code, message } (Node hata kodu iletiden sağlam: OpenSSL sürümüyle değişmez)
   * Döner: Doctor satırları { status, title, detail, group: "engine", kaynak: true }
   */
  function kaynakSatirlari(sonuclar) {
    var satirlar = (sonuclar || []).map(function (s) {
      var baslik = "Model kaynağı: " + s.host;
      var sure = s.sure > 0 ? " · " + s.sure + " ms" : "";
      if (s.dnsEngelAdresi) {
        return { status: "bad", title: baslik, detail: dnsEngelIpucu(s.host, s.dnsEngelAdresi), group: "engine", kaynak: true };
      }
      if (s.status >= 200 && s.status < 400 || s.status === 405) {
        return { status: "good", title: baslik, detail: s.ad + " · ulaşılıyor (HTTP " + s.status + ")" + sure + (s.caDenendi ? " · kurumsal sertifikayla" : ""), group: "engine", kaynak: true };
      }
      if (s.status >= 400) {
        var a = agHatasiAcikla("HTTP " + s.status, { host: s.host });
        return { status: "warn", title: baslik, detail: s.ad + " · " + a.mesaj, group: "engine", kaynak: true };
      }
      var b = agHatasiAcikla(s.hata || "bağlantı kurulamadı", { host: s.host, caDenendi: s.caDenendi });
      // sistem kökleri 5 sn içinde okunamadı / ikinci deneme bitmedi: okuma arka planda sürüp önbelleğe girer
      var ek = b.tur === "sertifika" && s.caSuresiDoldu ? " · " + YENIDEN_SINA : "";
      return { status: "bad", title: baslik, detail: s.ad + " · " + b.mesaj + ek, group: "engine", kaynak: true };
    });
    return satirlar;
  }

  return {
    SERTIFIKA_KODLARI: Object.keys(SERTIFIKA_HATALARI),
    SINAMA_ZAMAN_ASIMI: SINAMA_ZAMAN_ASIMI,
    WIN_BETIK: WIN_BETIK,
    sertifikaHatasiMi: sertifikaHatasiMi,
    pemleriAyikla: pemleriAyikla,
    caListesi: caListesi,
    sertifikaKomutu: sertifikaKomutu,
    guvenAyariKomutu: guvenAyariKomutu,
    reddedilenParmakIzleri: reddedilenParmakIzleri,
    reddedilenleriAt: reddedilenleriAt,
    dnsEngelliMi: dnsEngelliMi,
    dnsEngelAdresi: dnsEngelAdresi,
    dnsEngelTeshis: dnsEngelTeshis,
    dnsEngelIpucu: dnsEngelIpucu,
    DNS_ENGEL_COZUM: DNS_ENGEL_COZUM,
    agHatasiAcikla: agHatasiAcikla,
    kaynakAdresleri: kaynakAdresleri,
    kaynakSatirlari: kaynakSatirlari
  };
});
