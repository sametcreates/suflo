// Suflo testi: 3.4 adım 19 — js/ag-dayanim.js (kurumsal ağ dayanıklılığı, saf modül)
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var AG = require(path.join(ROOT, "js", "ag-dayanim.js"));
var gecen = 0, toplam = 0, J = JSON.stringify;
function ok(ad, kosul, ek) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

// sertifika hataları: kod ya da ileti (köprü hatayı çoğunlukla String(e) olarak taşır)
var kodlar = ["UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "SELF_SIGNED_CERT_IN_CHAIN", "CERT_UNTRUSTED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"];
ok("dört sertifika kodu yeniden denemeyi tetikler", kodlar.every(function (k) { var e = new Error("x"); e.code = k; return AG.sertifikaHatasiMi(e); }) && AG.SERTIFIKA_KODLARI.length === 4);
ok("Node iletileri de tanınır (kod düşmüş String(e))",
  AG.sertifikaHatasiMi("Error: unable to get local issuer certificate") && AG.sertifikaHatasiMi("Error: self signed certificate in certificate chain") &&
  AG.sertifikaHatasiMi("Error: unable to verify the first certificate") && AG.sertifikaHatasiMi("certificate not trusted"));
// inceleme 2: OpenSSL 3 (Node 17+) iletisi "self-signed" yazar; kod düşmüş metinde de tanınır
ok("OpenSSL 3 iletisi ('self-signed certificate in certificate chain') de sertifika hatası, HTTPS denetimi olarak anlatılır",
  AG.sertifikaHatasiMi("Error: self-signed certificate in certificate chain") &&
  AG.agHatasiAcikla("Error: self-signed certificate in certificate chain", { host: "huggingface.co" }).tur === "sertifika" &&
  /sertifika: SELF_SIGNED_CERT_IN_CHAIN/.test(AG.agHatasiAcikla("Error: self-signed certificate in certificate chain").mesaj) &&
  !AG.sertifikaHatasiMi({ code: "DEPTH_ZERO_SELF_SIGNED_CERT", message: "self-signed certificate" }) && !AG.sertifikaHatasiMi("Error: self-signed certificate"),
  AG.agHatasiAcikla("Error: self-signed certificate in certificate chain").mesaj);
ok("süresi dolmuş / ad uyuşmazlığı / tek sertifika kendinden imzalı / ağ hataları yeniden denenmez",
  !AG.sertifikaHatasiMi({ code: "CERT_HAS_EXPIRED", message: "certificate has expired" }) && !AG.sertifikaHatasiMi({ code: "ERR_TLS_CERT_ALTNAME_INVALID", message: "Hostname/IP does not match" }) &&
  !AG.sertifikaHatasiMi({ code: "DEPTH_ZERO_SELF_SIGNED_CERT", message: "self signed certificate" }) && !AG.sertifikaHatasiMi("ECONNRESET") && !AG.sertifikaHatasiMi(null));

// PEM ayıklama
var ca = fs.readFileSync(path.join(__dirname, "fixtures", "ag-tls", "ca.pem"), "utf8");
var govde = ca.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
var winCikti = "-----BEGIN CERTIFICATE-----\r\n" + govde + "\r\n-----END CERTIFICATE-----\r\n" + "-----BEGIN CERTIFICATE-----\r\n" + govde + "\r\n-----END CERTIFICATE-----\r\n" + "çöp satır\r\n-----BEGIN CERTIFICATE-----\r\nkısa\r\n-----END CERTIFICATE-----\r\n";
var pem = AG.pemleriAyikla(winCikti);
ok("PowerShell çıktısı: satır kırmasız base64 64 sütuna sarılır, yinelenen ve bozuk atılır",
  pem.length === 1 && pem[0].split("\n").slice(1, -2).every(function (l) { return l.length <= 64; }) && pem[0].replace(/\s+/g, "") === ca.replace(/\s+/g, ""), pem.length);
var tls = require("tls");
var ortak = tls.rootCertificates ? tls.rootCertificates.slice(0, 3) : [];
ok("caListesi: yerleşik kökler + ek kök; ek kök yoksa ya da hepsi zaten varsa null (boş tekrar yok)",
  AG.caListesi(ortak, []) === null && AG.caListesi(ortak, ortak.slice(0, 1)) === (ortak.length ? null : null) &&
  AG.caListesi(ortak, pem).length === ortak.length + 1 && AG.caListesi(undefined, pem).length === 1);

// sabit dışa aktarma komutları: argüman dizisi, girdi yok
var w = AG.sertifikaKomutu("win32"), m = AG.sertifikaKomutu("darwin");
ok("Windows: powershell argüman dizisi, CurrentUser\\Root + LocalMachine\\Root, sabit betik",
  w.cmd === "powershell.exe" && Array.isArray(w.args) && w.args[w.args.length - 1] === AG.WIN_BETIK &&
  /Cert:\\CurrentUser\\Root/.test(AG.WIN_BETIK) && /Cert:\\LocalMachine\\Root/.test(AG.WIN_BETIK) && !/\+/.test(AG.WIN_BETIK.replace(/\[Convert\]/, '')) && w.args.indexOf("-NoProfile") !== -1, AG.WIN_BETIK);
// inceleme 2: Windows'un reddettiği kökler (Disallowed depoları, amacı HTTPS'i dışlayanlar) ikinci denemeye girmez
ok("Windows betiği CurrentUser\\Disallowed ve LocalMachine\\Disallowed parmak izlerini atlar, amacı Sunucu Kimlik Doğrulamasını dışlayan kökü almaz",
  /Cert:\\CurrentUser\\Disallowed/.test(AG.WIN_BETIK) && /Cert:\\LocalMachine\\Disallowed/.test(AG.WIN_BETIK) &&
  /ContainsKey\(\[string\]\$c\.Thumbprint\)/.test(AG.WIN_BETIK) && /EnhancedKeyUsageList/.test(AG.WIN_BETIK) && /'1\.3\.6\.1\.5\.5\.7\.3\.1'/.test(AG.WIN_BETIK) &&
  AG.WIN_BETIK.indexOf("Disallowed") < AG.WIN_BETIK.indexOf("\\Root'"), AG.WIN_BETIK);
ok("macOS: security find-certificate -a -p System.keychain", m.cmd === "/usr/bin/security" && m.args.join(" ") === "find-certificate -a -p /Library/Keychains/System.keychain");
// inceleme 2: macOS güven ayarı (trust-settings-export): yalnız sonucu Deny (3) olan girdiler reddedilir
var plistOrnek = '<?xml version="1.0"?><plist version="1.0"><dict><key>trustList</key><dict>' +
  "<key>" + "a".repeat(40) + "</key><dict><key>issuerName</key><data>AA</data><key>trustSettings</key><array><dict>" +
  "<key>kSecTrustSettingsResult</key>\n\t<integer>3</integer></dict></array></dict>" +
  "<key>" + "B".repeat(40) + "</key><dict><key>trustSettings</key><array/></dict>" +
  "<key>" + "C".repeat(40) + "</key><dict><key>trustSettings</key><array><dict><key>kSecTrustSettingsResult</key><integer>1</integer></dict>" +
  "<dict><key>kSecTrustSettingsResult</key><integer>4</integer></dict></array></dict>" +
  "</dict><key>trustVersion</key><integer>1</integer></dict></plist>";
var red = AG.reddedilenParmakIzleri(plistOrnek);
ok("macOS güven ayarı: Deny girdisi reddedilir (büyük harf parmak izi), güven / belirsiz girdiler ve bozuk metin reddetmez",
  J(Object.keys(red)) === J(["A".repeat(40)]) && J(AG.reddedilenParmakIzleri("")) === "{}" && J(AG.reddedilenParmakIzleri("<plist>bozuk")) === "{}", J(red));
ok("macOS güven ayarı komutu: yönetici alanı -d, kullanıcı alanı -d'siz; dosya son argüman",
  AG.guvenAyariKomutu("yonetici", "/t/y.plist").args.join(" ") === "trust-settings-export -d /t/y.plist" &&
  AG.guvenAyariKomutu("kullanici", "/t/k.plist").args.join(" ") === "trust-settings-export /t/k.plist" && AG.guvenAyariKomutu("kullanici", "x").cmd === "/usr/bin/security");
var izler = {};
izler[AG.pemleriAyikla(ca)[0].replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, "")] = "A".repeat(40);
ok("reddedilenleriAt: parmak izi reddedilen PEM atılır; reddedilen yoksa liste aynen döner",
  AG.reddedilenleriAt(pem, red, function (b64) { return izler[b64] || "0".repeat(40); }).length === 0 &&
  AG.reddedilenleriAt(pem, {}, function () { return "A".repeat(40); }).length === 1 && AG.reddedilenleriAt(pem, red, null).length === 1);
ok("Linux: dışa aktarma komutu yok", AG.sertifikaKomutu("linux") === null);
var bridge = fs.readFileSync(path.join(ROOT, "js", "bridge.js"), "utf8");
var ekSert = bridge.slice(bridge.indexOf("function ekSertifikalar()"), bridge.indexOf("function ekCaListesi()"));
ok("köprü kök dışa aktarmayı run() ile (spawn + argüman dizisi) çalıştırır; exec / shell yok, sonuç bellekte",
  ekSert.length > 100 && /run\(komut\.cmd, komut\.args/.test(ekSert) && !/exec|shell|writeFile/.test(ekSert));

// DNS filtresi
ok("146.112.0.0/16 (Umbrella) ve 0.0.0.0 engel; komşu aralıklar değil",
  AG.dnsEngelliMi("146.112.61.106") && AG.dnsEngelliMi("146.112.0.1") && AG.dnsEngelliMi("::ffff:146.112.5.5") && AG.dnsEngelliMi("0.0.0.0") && AG.dnsEngelliMi("::") &&
  !AG.dnsEngelliMi("146.113.0.1") && !AG.dnsEngelliMi("14.6.112.1") && !AG.dnsEngelliMi("18.239.50.1") && !AG.dnsEngelliMi(""));
ok("dns.lookup({all:true}) çıktısında engelli adres bulunur",
  AG.dnsEngelAdresi([{ address: "2600::1", family: 6 }, { address: "146.112.61.107", family: 4 }]) === "146.112.61.107" && AG.dnsEngelAdresi([{ address: "1.1.1.1" }]) === "");
ok("DNS ipucu: Umbrella adı ve içe aktarma yolu", /Cisco Umbrella, 146\.112\.61\.106/.test(AG.dnsEngelIpucu("huggingface.co", "146.112.61.106")) &&
  /Model dosyası içe aktar/.test(AG.dnsEngelIpucu("huggingface.co", "0.0.0.0")) && !/Model dosyası/.test(AG.dnsEngelTeshis("x", "0.0.0.0")));

// hatayı anlat
function tur(h, ek) { return AG.agHatasiAcikla(h, ek).tur; }
ok("agHatasiAcikla türleri", tur("Error: getaddrinfo ENOTFOUND huggingface.co") === "dns" && tur({ code: "SELF_SIGNED_CERT_IN_CHAIN", message: "self signed certificate in certificate chain" }) === "sertifika" &&
  tur("zaman aşımı") === "zaman" && tur("Error: connect ECONNREFUSED 1.2.3.4:443") === "baglanti" && tur("Proxy CONNECT reddetti: HTTP 407") === "vekil" &&
  tur("HTTP 403") === "http" && tur("ENOTFOUND", { dnsEngelAdresi: "0.0.0.0", host: "h" }) === "dns-engel");
ok("sertifika açıklaması yeniden denendiğini söyler", /bir kez daha denedi/.test(AG.agHatasiAcikla("unable to get local issuer certificate", { caDenendi: true, host: "huggingface.co" }).mesaj));

// Doctor kaynakları
var adr = AG.kaynakAdresleri("https://github.com/ggerganov/whisper.cpp/releases/download/v1.9.1/whisper-blas-bin-x64.zip");
ok("sınanan kaynaklar: huggingface.co, hf-mirror.com, motor sürüm sunucusu", adr.map(function (a) { return a.host; }).join(",") === "huggingface.co,hf-mirror.com,github.com" && AG.SINAMA_ZAMAN_ASIMI === 5000);
var s = AG.kaynakSatirlari([{ ad: "A", host: "a", status: 200, sure: 12 }, { ad: "B", host: "b", status: 405 }, { ad: "C", host: "c", status: 503 }, { ad: "D", host: "d", status: 0, hata: "zaman aşımı" }]);
ok("kaynak satırları: 2xx/405 iyi, 5xx uyarı, bağlantısız kötü", s[0].status === "good" && /12 ms/.test(s[0].detail) && s[1].status === "good" && s[2].status === "warn" && s[3].status === "bad" && s.every(function (x) { return x.kaynak && x.group === "engine"; }));
// inceleme 2: hata { code, message } olarak gelir (OpenSSL 3 iletisi değişse de kod tanınır); sistem kökleri 5 sn'ye
// sığmadıysa satır "birkaç saniye sonra yeniden sına" der (zaman aşımı / güvenlik duvarı demez)
var s2 = AG.kaynakSatirlari([
  { ad: "Model aynası", host: "hf-mirror.com", status: 0, hata: { code: "SELF_SIGNED_CERT_IN_CHAIN", message: "Error: self-signed certificate in certificate chain" } },
  { ad: "Hugging Face (modeller)", host: "huggingface.co", status: 0, caSuresiDoldu: true, hata: { code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", message: "Error: unable to get local issuer certificate" } },
  { ad: "Motor sürümleri", host: "github.com", status: 0, caSuresiDoldu: true, hata: { code: "ETIMEDOUT", message: "zaman aşımı" } }]);
ok("kaynak satırı: kodlu hata HTTPS denetimi; süreye sığmayan sertifika denemesi 'yeniden sına' der, düz zaman aşımı demez",
  /HTTPS bağlantılarını denetliyor/.test(s2[0].detail) && !/yeniden sına/.test(s2[0].detail) &&
  /HTTPS bağlantılarını denetliyor/.test(s2[1].detail) && /birkaç saniye sonra yeniden sına/.test(s2[1].detail) && !/zaman aşımı/.test(s2[1].detail) &&
  /yanıt vermedi \(zaman aşımı\)/.test(s2[2].detail) && !/yeniden sına/.test(s2[2].detail), s2.map(function (x) { return x.detail; }).join(" || "));
ok("özel ayna ayarı yok (özet doğrulamasını atlatırdı)", !/ozelAyna|customMirror|mirrorUrl/i.test(fs.readFileSync(path.join(ROOT, "js", "engine.js"), "utf8") + fs.readFileSync(path.join(ROOT, "js", "ag-dayanim.js"), "utf8")));

// İngilizce arayüz: birleşik iletiler (ana makine adı, " · ", " — ", "\nÇözüm:") çalışma anında tam çevrilir
var vm = require("vm");
var ictx = { console: console }; ictx.window = ictx; vm.createContext(ictx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "i18n", "en.js"), "utf8"), ictx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "i18n.js"), "utf8"), ictx);
var MI = require(path.join(ROOT, "js", "model-ice-aktar.js"));
var ceviri = [
  AG.dnsEngelIpucu("github.com", "146.112.61.106"), AG.dnsEngelIpucu("hf-mirror.com", "0.0.0.0"),
  "HTTP 503 — " + AG.dnsEngelTeshis("huggingface.co", "146.112.61.106"),
  "Model aynası · " + AG.agHatasiAcikla({ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE", message: "x" }, { host: "hf-mirror.com", caDenendi: true }).mesaj,
  "Model aynası · " + AG.agHatasiAcikla({ code: "SELF_SIGNED_CERT_IN_CHAIN", message: "x" }, { host: "hf-mirror.com" }).mesaj,
  "Hugging Face (modeller) · " + AG.agHatasiAcikla("Error: getaddrinfo ENOTFOUND huggingface.co", { host: "huggingface.co" }).mesaj,
  "Motor sürümleri · " + AG.agHatasiAcikla("zaman aşımı", { host: "github.com" }).mesaj,
  "Motor sürümleri · " + AG.agHatasiAcikla("Error: read ECONNRESET", { host: "github.com" }).mesaj,
  "Motor sürümleri · " + AG.agHatasiAcikla("HTTP 451", { host: "github.com" }).mesaj,
  AG.agHatasiAcikla("Proxy CONNECT reddetti: HTTP 407").mesaj,
  AG.kaynakSatirlari([{ ad: "Hugging Face (modeller)", host: "huggingface.co", status: 200, sure: 85, caDenendi: true }])[0].detail,
  "Model kaynağı: huggingface.co",
  MI.ozelUyari("a.bin", MI.aileTahmin("ggml-large-v3-turbo-q8_0.bin", [{ id: "turbo", file: "ggml-large-v3-turbo-q5_0.bin" }])),
  MI.ozelUyari("a.bin", MI.aileTahmin("benim.bin", [])), MI.dogrulanmadiSorusu("Turbo"), MI.ustuneYazSorusu("ggml-tiny-q5_1.bin"),
  MI.basligiDenetle(Buffer.from("vers"), 100).mesaj, MI.basligiDenetle([1, 2, 3, 4], 100).mesaj, MI.basligiDenetle([1, 2, 3, 4], 5e9).mesaj,
  MI.basligiDenetle(Buffer.from("GGUF"), 5e6).mesaj, MI.basligiDenetle([1, 2, 3, 4], 5e6).mesaj, MI.katalogBoyutDenetle({ label: "Turbo — x", sizeMB: 574 }, 104857600).mesaj,
  "Model kopyalanıyor… %45", MI.ozelModelKaydi("ozel-x.bin", 5e6).label,
  s2[1].detail
];
// inceleme 2: model indirme hatasına (işaretli) hataYardimi'nin GERÇEK çıktısı: içe aktarma önerisi kendi satırında,
// "Çözüm:" satırı sözlükteki ipucuyla birebir (aynı satıra eklense satır Türkçe kalırdı)
var bridgeKaynak = fs.readFileSync(path.join(ROOT, "js", "bridge.js"), "utf8");
function kesB(bas, son) { var i = bridgeKaynak.indexOf(bas), j = bridgeKaynak.indexOf(son, i); return bridgeKaynak.slice(i, j + son.length); }
var hy = new Function("var MAC = false;\n" + kesB("var HATA_REHBERI", "\n  ];") + "\n" + kesB("function hataYardimi(", "\n  }") + "\n; return hataYardimi;")();
function modelHata(m) { var e = new Error(m); e.modelIceAktarOner = true; return hy(e); }
[ "Turbo indirilemedi: Error: unable to get local issuer certificate — Suflo bilgisayarın güvendiği sertifikalarla bir kez daha denedi, olmadı.",
  "Turbo indirilemedi: Error: getaddrinfo ENOTFOUND huggingface.co", "Turbo indirilemedi: Error: read ECONNRESET",
  "Turbo indirilemedi: HTTP 451" ].forEach(function (m) { ceviri.push(modelHata(m)); });
ok("hataYardimi: işaretli model hatasında içe aktarma önerisi ayrı satırda, ipucu satırı değişmeden",
  /\nÇözüm: Ağ HTTPS bağlantılarını denetliyor olabilir \(kurumsal güvenlik yazılımı\)\. BT ekibinden bu adres için izin iste; şirket ağındaysan Ayarlar'dan vekil sunucu tanımla\.\nOlmazsa modeli/.test(ceviri[ceviri.length - 4]),
  ceviri[ceviri.length - 4]);
var cevrilmeyen = ceviri.filter(function (s) { return /[ıİşŞğĞçÇöÖüÜ]/.test(ictx.SufloI18n.translate(s)); });
ok("İngilizce: yeni iletilerin hepsi çalışma anında çevrilir", cevrilmeyen.length === 0, cevrilmeyen.map(function (s) { return ictx.SufloI18n.translate(s); }).join(" | "));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
