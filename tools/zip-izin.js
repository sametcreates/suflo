/*
 * ZIP içindeki betiklere Unix çalıştırma izni yazar.
 *
 * NEDEN GEREKLİ: PowerShell'in Compress-Archive'ı ZIP kayıtlarına Unix mod
 * bitlerini HİÇ yazmıyor (external file attributes = 0). macOS bu arşivi
 * açınca .command dosyası çalıştırılamaz halde çıkıyor ve kullanıcı çift
 * tıklayınca "erişim ayrıcalıklarına sahip olmadığınız için açılamadı"
 * hatası alıyor. Kurulum daha başlamadan bitiyor.
 *
 * NASIL: ZIP central directory kaydının 38. baytındaki "external file
 * attributes" alanının ÜST 16 biti Unix modudur. Dosya içeriğine veya
 * boyutlara dokunmadan yalnızca o alanı yazıyoruz; arşiv geçerli kalıyor.
 *
 * Kullanım: node tools/zip-izin.js <zip yolu>
 */
var fs = require("fs");

var CD_IMZA = 0x02014b50;          // central directory dosya başlığı
var LOCAL_IMZA = 0x04034b50;       // yerel dosya başlığı
var MOD_CALISTIR = 0o755;          // rwxr-xr-x
var MOD_NORMAL = 0o644;            // rw-r--r--

/*
 * Compress-Archive yol ayracı olarak TERS BÖLÜ yazıyor ("panel\index.html").
 * ZIP belirtimi düz bölü şart koşar; macOS'un unzip'i ters bölüyü dosya adının
 * bir parçası sayar ve klasör yapısı hiç oluşmaz — kurucu "panel dosyaları
 * bulunamadı" der. Ad uzunluğu değişmediği için baytları yerinde çeviriyoruz.
 */
function ayraclariDuzelt(buf) {
  var sayac = 0;
  function duzelt(bas, adBaslangic, adUzunluk) {
    for (var k = 0; k < adUzunluk; k++) {
      if (buf[adBaslangic + k] === 0x5C) {      // "\"
        buf[adBaslangic + k] = 0x2F;            // "/"
        sayac++;
      }
    }
  }
  for (var i = 0; i < buf.length - 30; i++) {
    var imza = buf.readUInt32LE(i);
    if (imza === CD_IMZA) {
      duzelt(i, i + 46, buf.readUInt16LE(i + 28));
    } else if (imza === LOCAL_IMZA) {
      duzelt(i, i + 30, buf.readUInt16LE(i + 26));
    }
  }
  return sayac;
}

function calistirilabilirMi(ad) {
  return /\.(command|sh)$/i.test(ad);
}

function izinleriYaz(zipYolu) {
  var buf = fs.readFileSync(zipYolu);
  var degisen = [];
  var ayrac = ayraclariDuzelt(buf);
  if (ayrac) console.log("yol ayraci duzeltildi: " + ayrac + " ters bolu -> duz bolu");

  for (var i = 0; i < buf.length - 46; i++) {
    if (buf.readUInt32LE(i) !== CD_IMZA) continue;

    var adUzunluk = buf.readUInt16LE(i + 28);
    var ad = buf.toString("utf8", i + 46, i + 46 + adUzunluk);
    var dizinMi = /\/$/.test(ad);

    var mod = dizinMi ? 0o755 : (calistirilabilirMi(ad) ? MOD_CALISTIR : MOD_NORMAL);
    // üst 16 bit Unix modu; dosya tipi bitleri de gerekir (0o100000 dosya, 0o40000 dizin)
    var tip = dizinMi ? 0o040000 : 0o100000;
    var disAttr = ((tip | mod) << 16) >>> 0;

    // alt 16 bit MS-DOS öznitelikleri: dizinse 0x10, değilse 0
    disAttr = (disAttr | (dizinMi ? 0x10 : 0x00)) >>> 0;

    buf.writeUInt32LE(disAttr, i + 38);

    /*
     * "version made by" alanının üst baytı arşivi üreten sistemi bildirir.
     * 3 = Unix. Bu yazılmazsa unzip external attributes'u Unix modu olarak
     * YORUMLAMAZ ve izinler yine uygulanmaz.
     */
    buf.writeUInt8(3, i + 5);

    if (calistirilabilirMi(ad)) degisen.push(ad);
  }

  fs.writeFileSync(zipYolu, buf);
  return degisen;
}

var yol = process.argv[2];
if (!yol || !fs.existsSync(yol)) {
  console.error("kullanim: node tools/zip-izin.js <zip yolu>");
  process.exit(1);
}

var liste = izinleriYaz(yol);
console.log("calistirma izni verildi: " + (liste.length ? liste.join(", ") : "(betik bulunamadi)"));
